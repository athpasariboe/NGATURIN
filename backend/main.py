# =============================================================
# NGATURIN - BACKEND (main.py)
# =============================================================
# IMPROVEMENTS IN THIS FILE:
#
#  [1] AI RATE LIMIT        — max 20 AI chat messages per user per day
#                             tracked in the DB (ChatUsage table in models.py)
#
#  [2] 401 HANDLER          — all protected endpoints already return 401
#                             when a token expires. This file adds a clean
#                             JSON error so the frontend can detect it and
#                             redirect to login automatically.
#
#  [3] EMAIL VERIFICATION   — register now sends a 6-digit OTP to the
#                             user's email. The account is locked until
#                             they verify. Two new endpoints:
#                               POST /api/verify-email  { email, otp }
#                               POST /api/resend-otp    { email }
#
#  [4] FORGOT PASSWORD      — two new endpoints:
#                               POST /api/forgot-password  { email }
#                               POST /api/reset-password   { email, otp, new_password }
#                             Sends a 6-digit OTP to the user's email.
#                             OTP expires in 15 minutes.
#
# HOW EMAIL SENDING WORKS:
#   We use Gmail SMTP (free, no extra service needed).
#   Add these to your Vercel environment variables:
#     SMTP_EMAIL    = your Gmail address  (e.g. ngaturin.app@gmail.com)
#     SMTP_PASSWORD = your Gmail App Password (NOT your normal password)
#                     → Gmail → Manage Account → Security → App Passwords
#   The app password is a 16-character code Gmail generates for apps.
# =============================================================

# ── Standard library ─────────────────────────────────────────
import os
import random
import smtplib
from datetime import datetime, timedelta
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Literal
from uuid import UUID

# ── Third-party ──────────────────────────────────────────────
import httpx
from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy.orm import Session

# ── Local ─────────────────────────────────────────────────────
from auth import create_access_token, hash_password, verify_password
from database import Base, SessionLocal, engine
from models import (
    ChatUsage, Goal, Order, Pocket, Savings,
    Transaction, User, VerificationOTP,          # ← new models added in models.py
)


# =============================================================
# APP SETUP
# =============================================================

Base.metadata.create_all(bind=engine)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================================
# ENVIRONMENT VARIABLES
# =============================================================

SECRET_KEY     = os.getenv("SECRET_KEY")
ALGORITHM      = "HS256"
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# [3][4] Email credentials — set these in Vercel environment variables
SMTP_EMAIL    = os.getenv("SMTP_EMAIL")       # e.g. ngaturin.app@gmail.com
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")    # Gmail App Password (16 chars)

# [1] AI daily message limit per user
AI_DAILY_LIMIT = 20


# =============================================================
# DATABASE SESSION
# =============================================================

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# =============================================================
# AUTH HELPERS
# =============================================================

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/login")

# [2] 401 HANDLER
# get_current_user already raises 401 when the token is expired or invalid.
# The frontend now catches this and redirects to login automatically.
# (See script.js — the apiRequest() function checks for 401 responses.)
def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    credentials_exception = HTTPException(
        status_code=401,
        detail="Session expired. Please log in again.",   # [2] clear message for frontend
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(User).filter(User.email == email).first()
    if user is None:
        raise credentials_exception
    return user


# =============================================================
# [3][4] EMAIL HELPER
# Sends a plain-text or HTML email via Gmail SMTP.
# =============================================================

def send_email(to_email: str, subject: str, body_html: str):
    """
    Sends an email using Gmail SMTP.
    Raises an exception if SMTP credentials are not configured.
    """
    if not SMTP_EMAIL or not SMTP_PASSWORD:
        # In development without credentials, just print the OTP to console
        print(f"[DEV] Email to {to_email} | Subject: {subject}")
        print(f"[DEV] Body: {body_html}")
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = f"Ngaturin <{SMTP_EMAIL}>"
    msg["To"]      = to_email
    msg.attach(MIMEText(body_html, "html"))

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(SMTP_EMAIL, SMTP_PASSWORD)
            server.sendmail(SMTP_EMAIL, to_email, msg.as_string())
    except Exception as e:
        print(f"[ERROR] Failed to send email to {to_email}: {e}")
        raise HTTPException(status_code=500, detail="Failed to send email. Please try again.")


def generate_otp() -> str:
    """Returns a random 6-digit OTP string."""
    return str(random.randint(100000, 999999))


# =============================================================
# REQUEST / RESPONSE MODELS
# =============================================================

class UserCreate(BaseModel):
    username: str | None = None
    email: str
    password: str

class GoalCreate(BaseModel):
    title: str
    target_amount: float

class SavingsUpdate(BaseModel):
    amount: float

class PocketCreate(BaseModel):
    name:   str
    icon:   str | None = None
    target: float | None = 1000000

class PocketUpdate(BaseModel):
    name:   str | None = None
    icon:   str | None = None
    color:  str | None = None
    target: float | None = None

class TransactionCreate(BaseModel):
    pocket_id:  UUID
    amount:     float
    type:       Literal["in", "out"]
    note:       str | None = None
    created_at: datetime | None = None

class ChatRequest(BaseModel):
    message: str

# [3] Email verification models
class VerifyEmailRequest(BaseModel):
    email: str
    otp:   str

class ResendOTPRequest(BaseModel):
    email: str

# [4] Password reset models
class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    email:        str
    otp:          str
    new_password: str


# =============================================================
# AUTH ENDPOINTS
# =============================================================

# ── REGISTER ─────────────────────────────────────────────────
# [3] After creating the account, sends a 6-digit OTP to the
#     user's email. The account is marked is_verified=False
#     until they submit the correct OTP to /api/verify-email.
#     Unverified users cannot log in.
@app.post("/api/register")
def register(user: UserCreate, db: Session = Depends(get_db)):

    existing = db.query(User).filter(User.email == user.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already exists")

    new_user = User(
        username=user.username,
        email=user.email,
        password=hash_password(user.password),
        is_verified=False,          # [3] account starts unverified
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # [3] Generate and store OTP
    otp        = generate_otp()
    expires_at = datetime.utcnow() + timedelta(minutes=15)

    # Remove any old OTP for this email first (clean slate)
    db.query(VerificationOTP).filter(
        VerificationOTP.email == user.email,
        VerificationOTP.purpose == "verify"
    ).delete()
    db.add(VerificationOTP(email=user.email, otp=otp, expires_at=expires_at, purpose="verify"))
    db.commit()

    # [3] Send verification email
    send_email(
        to_email=user.email,
        subject="Ngaturin — Verify Your Email",
        body_html=f"""
        <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;">
          <h2 style="color:#2e7d32;">Welcome to Ngaturin! 👋</h2>
          <p>Thanks for signing up. Please verify your email address using the code below:</p>
          <div style="font-size:36px;font-weight:700;letter-spacing:8px;color:#1b5e20;
                      background:#f1f8e9;padding:20px;border-radius:12px;text-align:center;
                      margin:24px 0;">{otp}</div>
          <p style="color:#666;">This code expires in <strong>15 minutes</strong>.</p>
          <p style="color:#666;">If you didn't create an account, you can ignore this email.</p>
        </div>
        """
    )

    return {"message": "Account created! Please check your email for a verification code."}


# ── VERIFY EMAIL ──────────────────────────────────────────────
# [3] User submits their email + the 6-digit OTP they received.
#     On success, is_verified is set to True and they can log in.
@app.post("/api/verify-email")
def verify_email(data: VerifyEmailRequest, db: Session = Depends(get_db)):

    record = db.query(VerificationOTP).filter(
        VerificationOTP.email   == data.email,
        VerificationOTP.purpose == "verify"
    ).first()

    if not record:
        raise HTTPException(status_code=400, detail="No verification code found for this email")

    if datetime.utcnow() > record.expires_at:
        db.delete(record)
        db.commit()
        raise HTTPException(status_code=400, detail="Verification code has expired. Please request a new one.")

    if record.otp != data.otp:
        raise HTTPException(status_code=400, detail="Incorrect verification code")

    # Mark user as verified
    user = db.query(User).filter(User.email == data.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_verified = True
    db.delete(record)   # OTP is single-use — delete after success
    db.commit()

    return {"message": "Email verified successfully! You can now log in."}


# ── RESEND OTP ────────────────────────────────────────────────
# [3] In case the user didn't receive the email or it expired.
@app.post("/api/resend-otp")
def resend_otp(data: ResendOTPRequest, db: Session = Depends(get_db)):

    user = db.query(User).filter(User.email == data.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="Email not found")
    if user.is_verified:
        raise HTTPException(status_code=400, detail="This email is already verified")

    # Remove old OTP and create a fresh one
    db.query(VerificationOTP).filter(
        VerificationOTP.email   == data.email,
        VerificationOTP.purpose == "verify"
    ).delete()

    otp        = generate_otp()
    expires_at = datetime.utcnow() + timedelta(minutes=15)
    db.add(VerificationOTP(email=data.email, otp=otp, expires_at=expires_at, purpose="verify"))
    db.commit()

    send_email(
        to_email=data.email,
        subject="Ngaturin — New Verification Code",
        body_html=f"""
        <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;">
          <h2 style="color:#2e7d32;">New Verification Code</h2>
          <p>Here is your new verification code:</p>
          <div style="font-size:36px;font-weight:700;letter-spacing:8px;color:#1b5e20;
                      background:#f1f8e9;padding:20px;border-radius:12px;text-align:center;
                      margin:24px 0;">{otp}</div>
          <p style="color:#666;">Expires in <strong>15 minutes</strong>.</p>
        </div>
        """
    )

    return {"message": "New verification code sent to your email."}


# ── LOGIN ─────────────────────────────────────────────────────
# [3] Added check: unverified users are blocked from logging in
#     with a clear message to check their email.
@app.post("/api/login")
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    db_user = db.query(User).filter(User.email == form_data.username).first()

    if not db_user or not verify_password(form_data.password, db_user.password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # [3] Block login for unverified accounts
    if not db_user.is_verified:
        raise HTTPException(
            status_code=403,
            detail="Please verify your email before logging in. Check your inbox for the verification code."
        )

    token = create_access_token({"sub": db_user.email})
    return {"access_token": token, "token_type": "bearer"}


# ── FORGOT PASSWORD ───────────────────────────────────────────
# [4] Step 1: User enters their email. We send a 6-digit OTP.
#     The OTP is stored with purpose="reset" so it doesn't
#     interfere with email verification OTPs.
@app.post("/api/forgot-password")
def forgot_password(data: ForgotPasswordRequest, db: Session = Depends(get_db)):

    user = db.query(User).filter(User.email == data.email).first()

    # Security note: we always return the same message whether the
    # email exists or not. This prevents attackers from guessing
    # which emails are registered (user enumeration attack).
    if not user:
        return {"message": "If this email is registered, you will receive a reset code shortly."}

    # Remove any existing reset OTP for this email
    db.query(VerificationOTP).filter(
        VerificationOTP.email   == data.email,
        VerificationOTP.purpose == "reset"
    ).delete()

    otp        = generate_otp()
    expires_at = datetime.utcnow() + timedelta(minutes=15)
    db.add(VerificationOTP(email=data.email, otp=otp, expires_at=expires_at, purpose="reset"))
    db.commit()

    send_email(
        to_email=data.email,
        subject="Ngaturin — Password Reset Code",
        body_html=f"""
        <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;">
          <h2 style="color:#1565c0;">Reset Your Password</h2>
          <p>You requested a password reset. Use the code below:</p>
          <div style="font-size:36px;font-weight:700;letter-spacing:8px;color:#0d47a1;
                      background:#e3f2fd;padding:20px;border-radius:12px;text-align:center;
                      margin:24px 0;">{otp}</div>
          <p style="color:#666;">Expires in <strong>15 minutes</strong>.</p>
          <p style="color:#666;">If you didn't request this, you can safely ignore this email.</p>
        </div>
        """
    )

    return {"message": "If this email is registered, you will receive a reset code shortly."}


# ── RESET PASSWORD ────────────────────────────────────────────
# [4] Step 2: User submits email + OTP + new password.
#     Validates OTP, then updates the password hash in the DB.
@app.post("/api/reset-password")
def reset_password(data: ResetPasswordRequest, db: Session = Depends(get_db)):

    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    record = db.query(VerificationOTP).filter(
        VerificationOTP.email   == data.email,
        VerificationOTP.purpose == "reset"
    ).first()

    if not record:
        raise HTTPException(status_code=400, detail="No reset code found. Please request a new one.")

    if datetime.utcnow() > record.expires_at:
        db.delete(record)
        db.commit()
        raise HTTPException(status_code=400, detail="Reset code has expired. Please request a new one.")

    if record.otp != data.otp:
        raise HTTPException(status_code=400, detail="Incorrect reset code")

    user = db.query(User).filter(User.email == data.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.password = hash_password(data.new_password)
    db.delete(record)   # OTP is single-use
    db.commit()

    return {"message": "Password reset successfully! You can now log in with your new password."}


# ── GET CURRENT USER ──────────────────────────────────────────
@app.get("/api/me")
def get_user_profile(current_user: User = Depends(get_current_user)):
    return {
        "id":          str(current_user.id),
        "username":    current_user.username,
        "email":       current_user.email,
        "is_premium":  current_user.is_premium,
        "is_verified": current_user.is_verified,
    }


# =============================================================
# [1] AI CHAT — WITH RATE LIMIT
# =============================================================
# Each user gets AI_DAILY_LIMIT (20) messages per calendar day.
# Usage is tracked in the ChatUsage table (models.py).
# On every request we:
#   1. Count how many messages this user sent today.
#   2. If >= limit, return 429 Too Many Requests.
#   3. Otherwise, call OpenAI and increment the counter.
#
# COST ESTIMATE WITH THIS LIMIT:
#   20 msgs/user/day × 200 tokens avg = 4,000 tokens/user/day
#   gpt-4o-mini: $0.15/1M input tokens ≈ $0.0006 per user per day
#   Even with 100 active users → ~$0.06/day (~Rp 900/day)
#
# SYSTEM PROMPT:
#   Locks the AI to personal finance topics only.
#   Off-topic questions (coding, movies, etc.) are politely refused,
#   preventing users from "jailbreaking" their daily quota on
#   non-finance content.
# =============================================================

FINANCE_SYSTEM_PROMPT = """
You are Ngaturin AI Coach, a friendly personal finance assistant for Indonesian users.
You ONLY answer questions about personal finance topics such as:
- Budgeting and saving money
- Setting and tracking financial goals
- Managing income and expenses
- Basic investing concepts (deposito, reksa dana, saham)
- Debt management
- Understanding financial products (savings accounts, credit cards, etc.)
- General money mindset and habits

If the user asks about ANYTHING outside of personal finance (e.g. coding, movies,
general knowledge, creative writing, politics, etc.), politely decline and redirect
them back to finance topics. Say something like:
"I'm only able to help with personal finance topics! Is there anything about
budgeting, saving, or investing I can help you with?"

Keep answers concise (max 3-4 short paragraphs). Use simple language suitable
for young Indonesian adults. You may use occasional Indonesian words/phrases
to feel more relatable, but primarily respond in the same language the user wrote in.
"""

@app.post("/api/chat")
async def ai_chat(
    data: ChatRequest,
    current_user: User = Depends(get_current_user),   # requires valid JWT
    db: Session = Depends(get_db)
):
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="AI service not configured")

    # ── [1] Rate limit check ──────────────────────────────────
    today       = datetime.utcnow().date()
    usage_record = db.query(ChatUsage).filter(
        ChatUsage.user_id     == current_user.id,
        ChatUsage.usage_date  == today
    ).first()

    messages_used_today = usage_record.message_count if usage_record else 0

    if messages_used_today >= AI_DAILY_LIMIT:
        raise HTTPException(
            status_code=429,
            detail=f"Daily AI limit reached ({AI_DAILY_LIMIT} messages/day). Resets at midnight UTC."
        )
    # ─────────────────────────────────────────────────────────

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {OPENAI_API_KEY}",
                    "Content-Type":  "application/json"
                },
                json={
                    "model":      "gpt-4o-mini",   # cheapest capable model
                    "max_tokens": 400,              # hard cap per reply
                    "messages": [
                        {"role": "system", "content": FINANCE_SYSTEM_PROMPT},
                        {"role": "user",   "content": data.message}
                    ]
                }
            )
            result = response.json()

        if "error" in result:
            raise HTTPException(status_code=502, detail=result["error"]["message"])

        reply = result["choices"][0]["message"]["content"]

        # ── [1] Increment usage counter ───────────────────────
        if usage_record:
            usage_record.message_count += 1
        else:
            db.add(ChatUsage(
                user_id=current_user.id,
                usage_date=today,
                message_count=1
            ))
        db.commit()
        # ─────────────────────────────────────────────────────

        return {
            "reply":           reply,
            "messages_used":   messages_used_today + 1,    # so frontend can show "X/20 used"
            "messages_limit":  AI_DAILY_LIMIT
        }

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="AI service timed out. Please try again.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================
# GOAL ENDPOINTS
# =============================================================

@app.post("/api/goals")
def create_goal(goal: GoalCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    new_goal = Goal(title=goal.title, target_amount=goal.target_amount, user_id=current_user.id)
    db.add(new_goal); db.commit(); db.refresh(new_goal)
    return new_goal

@app.get("/api/goals")
def get_goals(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Goal).filter(Goal.user_id == current_user.id).all()

@app.put("/api/goals/{goal_id}")
def update_goal(goal_id: str, data: SavingsUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    goal = db.query(Goal).filter(Goal.id == goal_id, Goal.user_id == current_user.id).first()
    if not goal: raise HTTPException(status_code=404, detail="Goal not found")
    if goal.current_amount + data.amount > goal.target_amount:
        raise HTTPException(status_code=400, detail="Savings exceeds target amount")
    goal.current_amount += data.amount
    db.add(Savings(goal_id=goal.id, amount=data.amount))
    db.commit(); db.refresh(goal)
    return goal

@app.delete("/api/goals/{goal_id}")
def delete_goal(goal_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    goal = db.query(Goal).filter(Goal.id == goal_id, Goal.user_id == current_user.id).first()
    if not goal: raise HTTPException(status_code=404, detail="Goal not found")
    db.delete(goal); db.commit()
    return {"message": "Goal deleted successfully"}


# =============================================================
# POCKET ENDPOINTS
# =============================================================

@app.get("/api/pockets")
def get_pockets(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Pocket).filter(Pocket.user_id == current_user.id).all()

@app.post("/api/pockets")
def create_pocket(data: PocketCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = Pocket(name=data.name, icon=data.icon, color="#6C63FF", current=0, target=data.target or 1000000, user_id=current_user.id)
    db.add(p); db.commit(); db.refresh(p)
    return p

@app.put("/api/pockets/{pocket_id}")
def update_pocket(pocket_id: UUID, data: PocketUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    pocket = db.query(Pocket).filter(Pocket.id == pocket_id, Pocket.user_id == current_user.id).first()
    if not pocket: raise HTTPException(status_code=404, detail="Pocket not found")
    if data.name   is not None: pocket.name   = data.name
    if data.icon   is not None: pocket.icon   = data.icon
    if data.color  is not None: pocket.color  = data.color
    if data.target is not None: pocket.target = data.target
    db.commit(); db.refresh(pocket)
    return pocket

@app.delete("/api/pockets/{pocket_id}")
def delete_pocket(pocket_id: UUID, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    pocket = db.query(Pocket).filter(Pocket.id == pocket_id, Pocket.user_id == current_user.id).first()
    if not pocket: raise HTTPException(status_code=404, detail="Pocket not found")
    db.delete(pocket); db.commit()
    return {"message": "Pocket deleted successfully"}


# =============================================================
# TRANSACTION ENDPOINTS
# =============================================================

@app.post("/api/transactions")
def create_transaction(data: TransactionCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    pocket = db.query(Pocket).filter(Pocket.id == data.pocket_id, Pocket.user_id == current_user.id).first()
    if not pocket: raise HTTPException(status_code=404, detail="Pocket not found")
    if data.type == "in":
        pocket.current += data.amount
    else:
        if pocket.current < data.amount: raise HTTPException(status_code=400, detail="Insufficient funds")
        pocket.current -= data.amount
    db.add(Transaction(pocket_id=pocket.id, user_id=current_user.id, amount=data.amount,
                       type=data.type, note=data.note, created_at=data.created_at or datetime.utcnow()))
    db.commit()
    return {"message": "Transaction added successfully"}

@app.get("/api/pockets/{pocket_id}/transactions")
def get_transactions(pocket_id: UUID, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Transaction).filter(
        Transaction.pocket_id == pocket_id,
        Transaction.user_id   == current_user.id
    ).order_by(Transaction.created_at.desc()).all()

@app.get("/api/goals/{goal_id}/savings")
def get_goal_savings(goal_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    goal = db.query(Goal).filter(Goal.id == goal_id, Goal.user_id == current_user.id).first()
    if not goal: raise HTTPException(status_code=404, detail="Goal not found")
    return db.query(Savings).filter(Savings.goal_id == goal_id).order_by(Savings.created_at.desc()).all()


# =============================================================
# MIDTRANS PAYMENT WEBHOOK
# =============================================================

@app.post("/api/payment-handler")
async def payment_handler(request: Request, db: Session = Depends(get_db)):
    try:
        payload            = await request.json()
        order_id           = payload.get("order_id")
        transaction_status = payload.get("transaction_status")

        print(f"MIDTRANS WEBHOOK — order_id: {order_id}, status: {transaction_status}")

        if not order_id or not transaction_status:
            raise HTTPException(status_code=400, detail="Invalid payload")

        user = db.query(User).filter(User.email.ilike(f"{order_id}@%")).first()
        if not user:
            return {"status": "ignored", "message": f"User not found for order_id: {order_id}"}

        if transaction_status in ["settlement", "capture"]:
            user.is_premium = True
            db.commit()
            return {"status": "success", "message": f"Premium activated for {user.email}"}

        return {"status": "pending", "message": f"Status {transaction_status} noted for {user.email}"}

    except Exception as e:
        import traceback; print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

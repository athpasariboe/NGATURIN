# IMPORT LIBRARIES
from fastapi import FastAPI, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from fastapi.middleware.cors import CORSMiddleware
from jose import jwt, JWTError
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel

from database import engine, Base, SessionLocal
from models import User, Goal, Savings, Pocket, Transaction, Order
from auth import hash_password, verify_password, create_access_token
from uuid import UUID
from typing import Literal
from datetime import datetime

import os
import httpx                         # ← for calling OpenAI API
from fastapi import Request


# CREATE DATABASE TABLES
Base.metadata.create_all(bind=engine)


# CREATE FASTAPI APP
app = FastAPI()


# ENABLE CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# DATABASE SESSION
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# SECURITY CONFIG
SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM  = "HS256"

# ============================================================
# FIX: store your OpenAI key in an environment variable.
#      In Vercel dashboard → Settings → Environment Variables
#      add: OPENAI_API_KEY = sk-...
# ============================================================
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/login")


# GET CURRENT USER FROM TOKEN
def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials"
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


# ============================================================
# REQUEST MODELS
# ============================================================

class UserCreate(BaseModel):
    # FIX: added username field so it is accepted and saved from the register form
    username: str | None = None
    email: str
    password: str

class GoalCreate(BaseModel):
    title: str
    target_amount: float

class SavingsUpdate(BaseModel):
    amount: float

# ============================================================
# REGISTER
# FIX: now saves username to the database (was silently ignored before)
# ============================================================
@app.post("/api/register")
def register(user: UserCreate, db: Session = Depends(get_db)):

    existing = db.query(User).filter(User.email == user.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already exists")

    new_user = User(
        username=user.username,          # ← FIX: save username
        email=user.email,
        password=hash_password(user.password)
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return {"message": "User created successfully"}


# LOGIN
@app.post("/api/login")
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    db_user = db.query(User).filter(User.email == form_data.username).first()
    if not db_user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not verify_password(form_data.password, db_user.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token({"sub": db_user.email})
    return {"access_token": token, "token_type": "bearer"}


# GET CURRENT USER PROFILE
@app.get("/api/me")
def get_user_profile(current_user: User = Depends(get_current_user)):
    return {
        "id":         str(current_user.id),
        "username":   current_user.username,
        "email":      current_user.email,
        "is_premium": current_user.is_premium
    }


# ============================================================
# AI COACH CHAT ENDPOINT
#
# HOW TO KEEP COSTS LOW:
#   1. We use gpt-4o-mini  — cheapest OpenAI model (~$0.15/1M input tokens)
#   2. max_tokens=400      — hard cap on reply length
#   3. System prompt locks the AI to finance topics only. If the user
#      asks anything off-topic (movies, coding, etc.) the AI politely
#      refuses. This stops "jailbreak" prompts from burning tokens on
#      irrelevant topics.
#   4. We send ONLY the latest message, not the full chat history.
#      This keeps input tokens minimal (chat history is stored in the
#      browser via localStorage, not sent to the backend each time).
#
# COST ESTIMATE:
#   gpt-4o-mini:  input $0.15 / output $0.60 per 1M tokens
#   A typical financial question+answer ≈ 200 tokens total
#   → 1000 messages costs roughly $0.08 (8 US cents)
# ============================================================

FINANCE_SYSTEM_PROMPT = """
You are Ngaturin AI Coach, a friendly personal finance assistant for Indonesian users.
You ONLY answer questions about personal finance topics such as:
- Budgeting and saving money
- Setting and tracking financial goals
- Managing income and expenses
- Basic investing concepts
- Debt management
- Understanding financial products (savings accounts, credit cards, etc.)
- General money mindset and habits

If the user asks about ANYTHING outside of personal finance (e.g. coding, movies,
general knowledge, creative writing, etc.), politely decline and redirect them
back to finance topics.

Keep answers concise (max 3-4 short paragraphs). Use simple language suitable
for young Indonesian adults. You may use occasional Indonesian words/phrases
to feel more relatable, but primarily respond in the same language the user wrote in.
"""

class ChatRequest(BaseModel):
    message: str

@app.post("/api/chat")
async def ai_chat(
    data: ChatRequest,
    current_user: User = Depends(get_current_user)   # ← FIX: requires valid JWT, both free and premium users allowed
):
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="AI service not configured")

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
                    "max_tokens": 400,              # hard cap to control cost
                    "messages": [
                        {"role": "system",  "content": FINANCE_SYSTEM_PROMPT},
                        {"role": "user",    "content": data.message}
                    ]
                }
            )
            result = response.json()

        if "error" in result:
            raise HTTPException(status_code=502, detail=result["error"]["message"])

        reply = result["choices"][0]["message"]["content"]
        return {"reply": reply}

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="AI service timed out")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# GOAL ENDPOINTS
# ============================================================

@app.post("/api/goals")
def create_goal(
    goal: GoalCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    new_goal = Goal(
        title=goal.title,
        target_amount=goal.target_amount,
        user_id=current_user.id
    )
    db.add(new_goal)
    db.commit()
    db.refresh(new_goal)
    return new_goal


@app.get("/api/goals")
def get_goals(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return db.query(Goal).filter(Goal.user_id == current_user.id).all()


@app.put("/api/goals/{goal_id}")
def update_goal(
    goal_id: str,
    data: SavingsUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    goal = db.query(Goal).filter(
        Goal.id == goal_id,
        Goal.user_id == current_user.id
    ).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    if goal.current_amount + data.amount > goal.target_amount:
        raise HTTPException(status_code=400, detail="Savings exceeds target amount")

    goal.current_amount += data.amount
    new_saving = Savings(goal_id=goal.id, amount=data.amount)
    db.add(new_saving)
    db.commit()
    db.refresh(goal)
    return goal


@app.delete("/api/goals/{goal_id}")
def delete_goal(
    goal_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    goal = db.query(Goal).filter(
        Goal.id == goal_id,
        Goal.user_id == current_user.id
    ).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    db.delete(goal)
    db.commit()
    return {"message": "Goal deleted successfully"}


# ============================================================
# POCKET ENDPOINTS
# ============================================================

class PocketCreate(BaseModel):
    name:   str
    icon:   str | None = None
    target: float | None = 1000000

class PocketUpdate(BaseModel):
    name:   str | None = None
    icon:   str | None = None
    color:  str | None = None
    target: float | None = None


@app.get("/api/pockets")
def get_pockets(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return db.query(Pocket).filter(Pocket.user_id == current_user.id).all()


@app.post("/api/pockets")
def create_pocket(
    data: PocketCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    new_pocket = Pocket(
        name=data.name,
        icon=data.icon,
        color="#6C63FF",
        current=0,
        target=data.target or 1000000,
        user_id=current_user.id
    )
    db.add(new_pocket)
    db.commit()
    db.refresh(new_pocket)
    return new_pocket


@app.put("/api/pockets/{pocket_id}")
def update_pocket(
    pocket_id: UUID,
    data: PocketUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    pocket = db.query(Pocket).filter(
        Pocket.id == pocket_id,
        Pocket.user_id == current_user.id
    ).first()
    if not pocket:
        raise HTTPException(status_code=404, detail="Pocket not found")

    if data.name   is not None: pocket.name   = data.name
    if data.icon   is not None: pocket.icon   = data.icon
    if data.color  is not None: pocket.color  = data.color
    if data.target is not None: pocket.target = data.target   # ← FIX: target update now actually applied

    db.commit()
    db.refresh(pocket)
    return pocket


@app.delete("/api/pockets/{pocket_id}")
def delete_pocket(
    pocket_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    pocket = db.query(Pocket).filter(
        Pocket.id == pocket_id,
        Pocket.user_id == current_user.id
    ).first()
    if not pocket:
        raise HTTPException(status_code=404, detail="Pocket not found")

    db.delete(pocket)
    db.commit()
    return {"message": "Pocket deleted successfully"}


# ============================================================
# TRANSACTION ENDPOINTS
# ============================================================

class TransactionCreate(BaseModel):
    pocket_id:  UUID
    amount:     float
    type:       Literal["in", "out"]
    note:       str | None = None
    created_at: datetime | None = None


@app.post("/api/transactions")
def create_transaction(
    data: TransactionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    pocket = db.query(Pocket).filter(
        Pocket.id == data.pocket_id,
        Pocket.user_id == current_user.id
    ).first()
    if not pocket:
        raise HTTPException(status_code=404, detail="Pocket not found")

    if data.type == "in":
        pocket.current += data.amount
    elif data.type == "out":
        if pocket.current < data.amount:
            raise HTTPException(status_code=400, detail="Insufficient funds")
        pocket.current -= data.amount

    new_tx = Transaction(
        pocket_id=pocket.id,
        user_id=current_user.id,
        amount=data.amount,
        type=data.type,
        note=data.note,
        created_at=data.created_at or datetime.utcnow()
    )
    db.add(new_tx)
    db.commit()
    db.refresh(new_tx)
    return {"message": "Transaction added successfully"}


@app.get("/api/pockets/{pocket_id}/transactions")
def get_transactions(
    pocket_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return db.query(Transaction).filter(
        Transaction.pocket_id == pocket_id,
        Transaction.user_id   == current_user.id
    ).order_by(Transaction.created_at.desc()).all()


@app.get("/api/goals/{goal_id}/savings")
def get_goal_savings(
    goal_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    goal = db.query(Goal).filter(
        Goal.id == goal_id,
        Goal.user_id == current_user.id
    ).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    return db.query(Savings)\
        .filter(Savings.goal_id == goal_id)\
        .order_by(Savings.created_at.desc())\
        .all()


# ============================================================
# MIDTRANS PAYMENT WEBHOOK
# ============================================================

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

        return {"status": "pending", "message": f"Status {transaction_status} received for {user.email}"}

    except Exception as e:
        import traceback
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# FIX: REMOVED debug endpoints that bypassed payment security:
#   - GET /api/force-unlock/{order_id}  ← DELETED
#   - GET /api/check-me                 ← DELETED
# These allowed anyone to get premium for free without paying.
# ============================================================

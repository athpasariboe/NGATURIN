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
from fastapi import Request



# CREATE DATABASE TABLES

Base.metadata.create_all(bind=engine)



# CREATE FASTAPI APP

app = FastAPI()



# ENABLE CORS (FRONTEND CAN ACCESS BACKEND)

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
ALGORITHM = "HS256"

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



# REQUEST MODELS

class UserCreate(BaseModel):
    email: str
    password: str


class GoalCreate(BaseModel):
    title: str
    target_amount: float


# UPDATE SAVINGS REQUEST

class SavingsUpdate(BaseModel):
    amount: float


# REGISTER

@app.post("/api/register")
def register(user: UserCreate, db: Session = Depends(get_db)):

    existing = db.query(User).filter(User.email == user.email).first()

    if existing:
        raise HTTPException(
            status_code=400,
            detail="Email already exists"
        )

    new_user = User(
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

    db_user = db.query(User).filter(
        User.email == form_data.username
    ).first()

    if not db_user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not verify_password(form_data.password, db_user.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token({"sub": db_user.email})

    return {
        "access_token": token,
        "token_type": "bearer"
    }

# GET CURRENT USER PROFILE

@app.get("/api/me")
def get_user_profile(current_user: User = Depends(get_current_user)):
    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "is_premium": current_user.is_premium
    }



# CREATE GOAL

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



# GET USER GOALS

@app.get("/api/goals")
def get_goals(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    goals = db.query(Goal).filter(
        Goal.user_id == current_user.id
    ).all()

    return goals


# UPDATE GOAL PROGRESS

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

    # Prevent exceeding target
    if goal.current_amount + data.amount > goal.target_amount:
        raise HTTPException(
            status_code=400,
            detail="Savings exceeds target amount"
        )

    # Add savings to goal
    goal.current_amount += data.amount

    # Create savings record
    new_saving = Savings(
        goal_id=goal.id,
        amount=data.amount
    )

    db.add(new_saving)

    db.commit()
    db.refresh(goal)

    return goal


# DELETE GOAL
# This API endpoint deletes a goal from the database
# based on the goal ID provided in the URL.

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


# CREATE POCKET REQUEST MODEL
# This model defines the data required when creating a new pocket

class PocketCreate(BaseModel):
    name: str
    icon: str | None = None
    target: float | None = 1000000

class PocketUpdate(BaseModel):
    name: str | None = None
    icon: str | None = None
    color: str | None = None
    target: float | None = None

# GET USER POCKETS
# Returns all pockets that belong to the currently logged-in user

@app.get("/api/pockets")
def get_pockets(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    pockets = db.query(Pocket).filter(
        Pocket.user_id == current_user.id
    ).all()

    return pockets

# CREATE POCKET
# This endpoint creates a new pocket for the authenticated user

@app.post("/api/pockets")
def create_pocket(
    data: PocketCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    new_pocket = Pocket(
        name=data.name,
        icon=data.icon,
        color="#6C63FF",  # default color
        current=0,
        target=data.target or 1000000,
        user_id=current_user.id
    )

    db.add(new_pocket)
    db.commit()
    db.refresh(new_pocket)

    return new_pocket

# UPDATE POCKET
# This endpoint updates pocket details (name, icon, target, color)

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

    if data.name is not None:
        pocket.name = data.name
    if data.icon is not None:
        pocket.icon = data.icon
    if data.color is not None:
        pocket.color = data.color
    if data.target is not None:
        pocket.target = data.target

    db.commit()
    db.refresh(pocket)

    return pocket

# DELETE POCKET
# This endpoint deletes a pocket based on pocket ID

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


# CREATE TRANSACTION REQUEST MODEL
# This model defines the data required to create a transaction

class TransactionCreate(BaseModel):
    pocket_id: UUID
    amount: float
    type: Literal["in", "out"]   # "in" (income) or "out" (expense)
    note: str | None = None
    created_at: datetime | None = None

# CREATE TRANSACTION
# This endpoint records a transaction and updates pocket balance

@app.post("/api/transactions")
def create_transaction(
    data: TransactionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    # Check if pocket exists and belongs to user
    pocket = db.query(Pocket).filter(
        Pocket.id == data.pocket_id,
        Pocket.user_id == current_user.id
    ).first()

    if not pocket:
        raise HTTPException(status_code=404, detail="Pocket not found")

    # Update pocket balance
    if data.type == "in":
        pocket.current += data.amount

    elif data.type == "out":
        if pocket.current < data.amount:
            raise HTTPException(
                status_code=400,
                detail="Insufficient funds"
            )
        pocket.current -= data.amount

    # Create transaction record
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

# GET POCKET TRANSACTIONS
# Returns all transactions for a specific pocket

@app.get("/api/pockets/{pocket_id}/transactions")
def get_transactions(
    pocket_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    transactions = db.query(Transaction).filter(
        Transaction.pocket_id == pocket_id,
        Transaction.user_id == current_user.id
    ).order_by(Transaction.created_at.desc()).all()

    return transactions

# GET SAVINGS HISTORY
# Returns all savings transactions for a goal.

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

    savings = db.query(Savings)\
        .filter(Savings.goal_id == goal_id)\
        .order_by(Savings.created_at.desc())\
        .all()

    return savings

# ==========================
# MIDTRANS WEBHOOK HANDLER
# ==========================

@app.post("/api/payment-handler")
async def payment_handler(request: Request, db: Session = Depends(get_db)):
    try:
        # Get JSON from Midtrans
        payload = await request.json()
        
        order_id = payload.get("order_id")
        transaction_status = payload.get("transaction_status")
        
        # Log to Server Console
        print("\n" + "="*30)
        print(f"⚡ MIDTRANS WEBHOOK ARRIVED ⚡")
        print(f"Order ID       : {order_id}")
        print(f"Payment Status : {transaction_status}")
        print("="*30 + "\n")
        
        # Guard clause
        if not order_id or not transaction_status:
            raise HTTPException(status_code=400, detail="Invalid payload from payment gateway")
            
        # Determine the user based on the order_id (which acts as the username / prefix of email)
        # e.g., order_id = "darmawijayaamanda" -> matches exactly "darmawijayaamanda@..."
        user = db.query(User).filter(User.email.ilike(f"{order_id}@%")).first()
        
        if not user:
            print(f"❌ User NOT FOUND for username: {order_id}")
            return {"status": "ignored", "message": f"User not found for username/order_id: {order_id}"}
        
        # If successfully paid (settlement)
        if transaction_status in ["settlement", "capture"]:
            user.is_premium = True
            db.commit()
            print(f"✅ UNLOCKED PREMIUM for {user.email}")
            return {"status": "success", "message": f"Premium activated for user {user.email}"}
                
        print(f"⏳ Status is {transaction_status}, waiting for settlement")
        return {"status": "success", "message": f"Notification received for {user.email}, but not a settlement"}
        
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

# ==========================
# DIAGNOSTIC TOOL (FORCE UNLOCK)
# ==========================

@app.get("/api/force-unlock/{order_id}")
def force_unlock(order_id: str, db: Session = Depends(get_db)):
    try:
        user = db.query(User).filter(User.email.ilike(f"{order_id}%")).first()
        if not user:
            raise HTTPException(status_code=404, detail=f"User not found for order_id: {order_id}")
            
        user.is_premium = True
        db.commit()
        
        return {"status": "success", "message": f"Premium successfully forced for {user.email}. You can now test the Open Pockets button!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
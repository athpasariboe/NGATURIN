# IMPORT LIBRARIES
from sqlalchemy import Column, String, Float, ForeignKey, DateTime, Boolean, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid

from database import Base


# USER MODEL

class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True)
    password = Column(String)
    is_premium = Column(Boolean, default=False)

    goals = relationship("Goal", back_populates="owner")
    orders = relationship("Order", back_populates="user")


# GOAL MODEL

class Goal(Base):
    __tablename__ = "goals"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    title = Column(String)
    target_amount = Column(Float)
    current_amount = Column(Float, default=0)

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))

    owner = relationship("User", back_populates="goals")

    savings = relationship(
    "Savings",
    back_populates="goal",
    cascade="all, delete"
    )


# SAVINGS MODEL

class Savings(Base):
    __tablename__ = "savings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    goal_id = Column(UUID(as_uuid=True), ForeignKey("goals.id"))

    amount = Column(Float)

    created_at = Column(DateTime, default=datetime.utcnow)

    goal = relationship("Goal", back_populates="savings")

class Pocket(Base):
    __tablename__ = "pockets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    name = Column(String)
    icon = Column(String)
    color = Column(String)

    current = Column(Float, default=0)
    target = Column(Float, default=1000000)

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))

    transactions = relationship(
        "Transaction",
        back_populates="pocket",
        cascade="all, delete"
    )


# POCKET NOTES

class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    pocket_id = Column(UUID(as_uuid=True), ForeignKey("pockets.id"))
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))

    amount = Column(Float)
    type = Column(String)  # "in" / "out"
    note = Column(String)

    created_at = Column(DateTime, default=datetime.utcnow)

    pocket = relationship("Pocket", back_populates="transactions")
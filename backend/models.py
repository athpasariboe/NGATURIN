# =============================================================
# NGATURIN - DATABASE MODELS (models.py)
# =============================================================
# CHANGES IN THIS FILE:
#
#  [1] ChatUsage model    — tracks how many AI messages each user
#                           has sent today (for the 20/day limit)
#
#  [3] User.is_verified   — new boolean column, False until user
#                           confirms their email with an OTP
#
#  [3][4] VerificationOTP — stores OTP codes for both email
#                           verification (purpose="verify") and
#                           password reset (purpose="reset")
#
# DATABASE MIGRATION NOTE:
#   You are adding 3 new things to an existing database:
#     1. Column  users.is_verified        (Boolean, default True for existing rows)
#     2. Column  users.username           (String, nullable — from previous fix)
#     3. Table   verification_otps        (new)
#     4. Table   chat_usage               (new)
#
#   Run these SQL commands ONCE in your PostgreSQL database
#   (use your Vercel Postgres console or psql):
#
#     ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR;
#     ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT TRUE;
#     CREATE TABLE IF NOT EXISTS verification_otps (
#         id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
#         email VARCHAR NOT NULL,
#         otp VARCHAR NOT NULL,
#         expires_at TIMESTAMP NOT NULL,
#         purpose VARCHAR NOT NULL DEFAULT 'verify'
#     );
#     CREATE TABLE IF NOT EXISTS chat_usage (
#         id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
#         user_id UUID REFERENCES users(id) ON DELETE CASCADE,
#         usage_date DATE NOT NULL,
#         message_count INTEGER DEFAULT 0,
#         UNIQUE(user_id, usage_date)
#     );
#
#   We set existing users' is_verified = TRUE (DEFAULT TRUE) so
#   they are NOT locked out after the migration.
# =============================================================

from sqlalchemy import Column, String, Float, ForeignKey, DateTime, Boolean, Integer, Date
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid

from database import Base


# =============================================================
# USER MODEL
# =============================================================

class User(Base):
    __tablename__ = "users"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username   = Column(String, nullable=True)
    email      = Column(String, unique=True, nullable=False)
    password   = Column(String, nullable=False)
    is_premium  = Column(Boolean, default=False)

    # [3] NEW: tracks whether the user has confirmed their email.
    #     Default=True so existing users in the DB are not affected.
    is_verified = Column(Boolean, default=True)

    goals       = relationship("Goal",  back_populates="owner")
    orders      = relationship("Order", back_populates="user")

    # [1] NEW: link to daily AI usage records
    chat_usages = relationship("ChatUsage", back_populates="user", cascade="all, delete")


# =============================================================
# GOAL MODEL
# =============================================================

class Goal(Base):
    __tablename__ = "goals"

    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title          = Column(String)
    target_amount  = Column(Float)
    current_amount = Column(Float, default=0)
    user_id        = Column(UUID(as_uuid=True), ForeignKey("users.id"))

    owner   = relationship("User", back_populates="goals")
    savings = relationship("Savings", back_populates="goal", cascade="all, delete")


# =============================================================
# SAVINGS MODEL
# =============================================================

class Savings(Base):
    __tablename__ = "savings"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    goal_id    = Column(UUID(as_uuid=True), ForeignKey("goals.id"))
    amount     = Column(Float)
    created_at = Column(DateTime, default=datetime.utcnow)

    goal = relationship("Goal", back_populates="savings")


# =============================================================
# POCKET MODEL
# =============================================================

class Pocket(Base):
    __tablename__ = "pockets"

    id      = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name    = Column(String)
    icon    = Column(String)
    color   = Column(String)
    current = Column(Float, default=0)
    target  = Column(Float, default=1000000)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))

    transactions = relationship("Transaction", back_populates="pocket", cascade="all, delete")


# =============================================================
# TRANSACTION MODEL
# =============================================================

class Transaction(Base):
    __tablename__ = "transactions"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    pocket_id  = Column(UUID(as_uuid=True), ForeignKey("pockets.id"))
    user_id    = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    amount     = Column(Float)
    type       = Column(String)   # "in" / "out"
    note       = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)

    pocket = relationship("Pocket", back_populates="transactions")


# =============================================================
# ORDER MODEL (Payment tracking)
# =============================================================

class Order(Base):
    __tablename__ = "orders"

    order_id   = Column(String, primary_key=True)
    amount     = Column(Integer)
    status     = Column(String, default="pending")   # pending | settlement | expire
    created_at = Column(DateTime, default=datetime.utcnow)
    user_id    = Column(UUID(as_uuid=True), ForeignKey("users.id"))

    user = relationship("User", back_populates="orders")


# =============================================================
# [3][4] VERIFICATION OTP MODEL
# =============================================================
# Stores temporary OTP codes used for:
#   - Email verification after register  (purpose = "verify")
#   - Password reset                     (purpose = "reset")
#
# Each OTP expires after 15 minutes and is deleted after use.
# A user can only have ONE active OTP per purpose at a time.
# =============================================================

class VerificationOTP(Base):
    __tablename__ = "verification_otps"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # The email this OTP was sent to (used to look it up, no FK needed)
    email      = Column(String, nullable=False, index=True)

    # The 6-digit code sent to the user
    otp        = Column(String, nullable=False)

    # When the OTP expires (15 minutes from creation)
    expires_at = Column(DateTime, nullable=False)

    # "verify" = email verification after register
    # "reset"  = password reset
    purpose    = Column(String, nullable=False, default="verify")

    created_at = Column(DateTime, default=datetime.utcnow)


# =============================================================
# [1] CHAT USAGE MODEL
# =============================================================
# Tracks how many AI chat messages each user has sent per day.
# One row per user per calendar day.
# The UNIQUE constraint on (user_id, usage_date) ensures we
# never accidentally double-count.
# =============================================================

class ChatUsage(Base):
    __tablename__ = "chat_usage"

    id            = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    user_id       = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    # The calendar date this record is for (UTC date)
    usage_date    = Column(Date, nullable=False)

    # How many messages the user has sent on this date
    message_count = Column(Integer, default=0)

    user = relationship("User", back_populates="chat_usages")

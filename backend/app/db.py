"""
Database connection and session management for the FastAPI application.
This module sets up the SQLAlchemy engine, session factory, and base class for ORM models.
Gives each request its own db session
"""

from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

DB_PATH = Path(__file__).resolve().parents[1] / "data_peaks.db"

engine = create_engine(
    f"sqlite:///{DB_PATH}",
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False)


class Base(DeclarativeBase):
    pass


def add_missing_columns(bind=engine):
    """create_all never alters existing tables, so columns added later are added here (SQLite)."""
    with bind.begin() as conn:
        columns = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(experts)")}
        if columns and "followed" not in columns:
            conn.exec_driver_sql("ALTER TABLE experts ADD COLUMN followed TEXT")
        q_cols = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(questions)")}
        if q_cols and "delphi_round" not in q_cols:
            conn.exec_driver_sql("ALTER TABLE questions ADD COLUMN delphi_round INTEGER DEFAULT 1")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
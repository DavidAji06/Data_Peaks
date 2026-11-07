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
    added = {
        "experts": {"followed": "TEXT"},
        "panel_invites": {"email_sent": "BOOLEAN", "expert_id": "VARCHAR", "joined_at": "DATETIME"},
    }
    with bind.begin() as conn:
        for table, wanted in added.items():
            columns = {row[1] for row in conn.exec_driver_sql(f"PRAGMA table_info({table})")}
            for name, sql_type in wanted.items():
                if columns and name not in columns:
                    conn.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN {name} {sql_type}")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
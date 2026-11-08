"""
Database connection and session management for the FastAPI application.
This module sets up the SQLAlchemy engine, session factory, and base class for ORM models.
Gives each request its own db session
"""

import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# DATABASE_URL (e.g. a hosted Postgres) wins; otherwise a local SQLite file.
# DATABASE_PATH lets a container keep the SQLite file on a mounted disk.
DB_PATH = Path(os.getenv("DATABASE_PATH") or Path(__file__).resolve().parents[1] / "data_peaks.db")


def database_url() -> str:
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        return f"sqlite:///{DB_PATH}"
    # Hosts hand out postgres:// or postgresql://; SQLAlchemy needs the psycopg (v3) driver named
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


DATABASE_URL = database_url()
IS_SQLITE = DATABASE_URL.startswith("sqlite")

engine = create_engine(
    DATABASE_URL,
    **(
        {"connect_args": {"check_same_thread": False}}
        if IS_SQLITE
        # Free hosted Postgres closes idle connections: check before use, keep the pool small
        else {"pool_pre_ping": True, "pool_size": 5, "max_overflow": 5, "pool_recycle": 300}
    ),
)
SessionLocal = sessionmaker(bind=engine, autoflush=False)


class Base(DeclarativeBase):
    pass


def add_missing_columns(bind=engine):
    """create_all never alters existing tables, so columns added later are added here (SQLite).
    Postgres databases are new, so create_all already made every column."""
    if bind.dialect.name != "sqlite":
        return
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
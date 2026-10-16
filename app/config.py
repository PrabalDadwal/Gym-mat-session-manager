import os

class Settings:
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./apex_mats.db")
    MAX_MATS_PER_SESSION: int = 20
    APP_NAME: str = "APEX MAT LAB"
    SECRET_KEY: str = os.getenv("SECRET_KEY", "apex-tactical-secret-key-2026")
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")

settings = Settings()

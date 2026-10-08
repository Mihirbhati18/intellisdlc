import os
from pathlib import Path

from pydantic_settings import BaseSettings

BASE_DIR = Path(__file__).resolve().parent.parent


def _load_dotenv() -> None:
    env_file = BASE_DIR / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


_load_dotenv()


class Settings(BaseSettings):
    app_name: str = "IntelliSDLC"
    api_prefix: str = "/api/v1"
    database_url: str = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR / 'intellisdlc.db'}")
    jwt_secret: str = os.getenv("JWT_SECRET", "intellisdlc-dev-secret")
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 12
    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "")
    gemini_model: str = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
    model_path: Path = BASE_DIR / "ml" / "risk_model.pkl"
    metrics_path: Path = BASE_DIR / "ml" / "metrics.json"


settings = Settings()

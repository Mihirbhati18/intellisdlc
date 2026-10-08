from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import init_db
from .routers import auth, core, intelligence
from .services import risk


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    from .seed import seed_if_empty

    seed_if_empty()
    risk.load_model()
    yield


app = FastAPI(title=settings.app_name, version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get(settings.api_prefix + "/health", tags=["health"])
def health() -> dict:
    return {
        "status": "ok",
        "app": settings.app_name,
        "risk_model_loaded": risk.is_model_loaded(),
        "ai_mode": "gemini" if settings.gemini_api_key else "offline",
    }


app.include_router(auth.router, prefix=settings.api_prefix)
app.include_router(core.router, prefix=settings.api_prefix)
app.include_router(intelligence.router, prefix=settings.api_prefix)


@app.get("/")
def root() -> dict:
    return {"app": settings.app_name, "docs": "/docs", "api": settings.api_prefix}

import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select

from ..config import settings
from ..database import get_session
from ..models import Project, RiskPrediction, Role, Sprint, User
from ..security import get_current_user, is_manager
from ..services import agent, risk, traceability

router = APIRouter(tags=["intelligence"])


class PredictRiskIn(BaseModel):
    sprint_id: int


class AgentIn(BaseModel):
    project_id: Optional[int] = None
    question: str


@router.get("/traceability")
def get_traceability(
    project_id: Optional[int] = None,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    return traceability.build_matrix(session, project_id)


@router.post("/ai/predict-risk")
def predict_risk(
    payload: PredictRiskIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if not is_manager(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only ADMIN or PROJECT_MANAGER can run the risk predictor",
        )
    if not risk.is_model_loaded() and not risk.load_model():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Risk model is not available. Run: python ml/train_model.py",
        )
    sprint = session.get(Sprint, payload.sprint_id)
    if sprint is None:
        raise HTTPException(status_code=404, detail=f"Sprint {payload.sprint_id} not found")
    return risk.predict_sprint_risk(session, sprint)


@router.get("/ai/model-metrics")
def model_metrics(user: User = Depends(get_current_user)):
    if not settings.metrics_path.exists():
        raise HTTPException(status_code=404, detail="metrics.json not found")
    return json.loads(settings.metrics_path.read_text(encoding="utf-8"))


@router.get("/ai/risk-history")
def risk_history(
    sprint_id: Optional[int] = None,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    stmt = select(RiskPrediction)
    if sprint_id is not None:
        stmt = stmt.where(RiskPrediction.sprint_id == sprint_id)
    return session.exec(stmt.order_by(RiskPrediction.id.desc())).all()


@router.post("/ai/agent")
def ask_agent(
    payload: AgentIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    project_id = payload.project_id
    if project_id is None:
        project = session.exec(select(Project).order_by(Project.id)).first()
        project_id = project.id if project else 0
    return agent.answer_question(session, project_id, payload.question)


@router.get("/ai/agent/suggestions")
def agent_suggestions(user: User = Depends(get_current_user)):
    return {"questions": agent.suggested_questions()}

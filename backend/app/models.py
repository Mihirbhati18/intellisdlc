from datetime import date, datetime
from enum import Enum
from typing import Optional

from sqlmodel import Field, SQLModel


# Alias so models can declare a column literally named `date` without the
# field name shadowing the `date` type during annotation resolution.
DateType = date


def utcnow() -> datetime:
    return datetime.utcnow()


class Role(str, Enum):
    ADMIN = "ADMIN"
    PROJECT_MANAGER = "PROJECT_MANAGER"
    DEVELOPER = "DEVELOPER"
    QA_ENGINEER = "QA_ENGINEER"


class RequirementType(str, Enum):
    FUNCTIONAL = "FUNCTIONAL"
    NON_FUNCTIONAL = "NON_FUNCTIONAL"


class Priority(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class RequirementStatus(str, Enum):
    DRAFT = "DRAFT"
    UNDER_REVIEW = "UNDER_REVIEW"
    APPROVED = "APPROVED"
    IN_DEVELOPMENT = "IN_DEVELOPMENT"
    TESTED = "TESTED"
    DEPLOYED = "DEPLOYED"
    REJECTED = "REJECTED"


class SprintStatus(str, Enum):
    PLANNED = "PLANNED"
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"


class TaskType(str, Enum):
    DESIGN = "DESIGN"
    DEVELOPMENT = "DEVELOPMENT"
    TESTING = "TESTING"


class TaskStatus(str, Enum):
    TODO = "TODO"
    IN_PROGRESS = "IN_PROGRESS"
    REVIEW = "REVIEW"
    DONE = "DONE"
    BLOCKED = "BLOCKED"


class BugStatus(str, Enum):
    OPEN = "OPEN"
    ASSIGNED = "ASSIGNED"
    IN_PROGRESS = "IN_PROGRESS"
    RESOLVED = "RESOLVED"
    RETEST = "RETEST"
    CLOSED = "CLOSED"
    REOPENED = "REOPENED"


class TestStatus(str, Enum):
    NOT_RUN = "NOT_RUN"
    PASSED = "PASSED"
    FAILED = "FAILED"


class Environment(str, Enum):
    DEV = "DEV"
    STAGING = "STAGING"
    PRODUCTION = "PRODUCTION"


class DeploymentStatus(str, Enum):
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    PENDING = "PENDING"


class ProjectStatus(str, Enum):
    PLANNING = "PLANNING"
    ACTIVE = "ACTIVE"
    ON_HOLD = "ON_HOLD"
    COMPLETED = "COMPLETED"


class RiskLevel(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    full_name: str
    email: str = Field(index=True, unique=True)
    password_hash: str
    role: Role = Field(default=Role.DEVELOPER)
    is_active: bool = Field(default=True)
    skills: str = Field(default="")
    capacity_hours: int = Field(default=40)


class Project(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    description: str = Field(default="")
    status: ProjectStatus = Field(default=ProjectStatus.ACTIVE)


class Requirement(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    req_code: str = Field(index=True)
    project_id: int = Field(foreign_key="project.id", index=True)
    title: str
    description: str = Field(default="")
    type: RequirementType = Field(default=RequirementType.FUNCTIONAL)
    priority: Priority = Field(default=Priority.MEDIUM)
    status: RequirementStatus = Field(default=RequirementStatus.DRAFT)
    owner_id: Optional[int] = Field(default=None, foreign_key="user.id")
    version: int = Field(default=1)
    design_reference: Optional[str] = Field(default=None)


class RequirementVersion(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    requirement_id: int = Field(foreign_key="requirement.id", index=True)
    version: int
    changed_by: Optional[int] = Field(default=None, foreign_key="user.id")
    summary: str = Field(default="")
    created_at: datetime = Field(default_factory=utcnow)


class Sprint(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: int = Field(foreign_key="project.id", index=True)
    sprint_number: int
    name: str
    goal: str = Field(default="")
    start_date: date
    end_date: date
    status: SprintStatus = Field(default=SprintStatus.PLANNED)


class Task(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    sprint_id: Optional[int] = Field(default=None, foreign_key="sprint.id", index=True)
    requirement_id: Optional[int] = Field(default=None, foreign_key="requirement.id", index=True)
    title: str
    task_type: TaskType = Field(default=TaskType.DEVELOPMENT)
    estimate_hours: float = Field(default=8)
    status: TaskStatus = Field(default=TaskStatus.TODO)
    assigned_to: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    completed_at: Optional[datetime] = Field(default=None)


class TimeLog(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    task_id: int = Field(foreign_key="task.id", index=True)
    developer_id: int = Field(foreign_key="user.id")
    hours: float
    date: DateType = Field(default_factory=date.today)


class Bug(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    bug_code: str = Field(index=True)
    project_id: int = Field(foreign_key="project.id", index=True)
    requirement_id: Optional[int] = Field(default=None, foreign_key="requirement.id", index=True)
    sprint_id: Optional[int] = Field(default=None, foreign_key="sprint.id", index=True)
    title: str
    severity: Priority = Field(default=Priority.MEDIUM)
    status: BugStatus = Field(default=BugStatus.OPEN)
    assignee_id: Optional[int] = Field(default=None, foreign_key="user.id")


class TestCase(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    test_code: str = Field(index=True)
    requirement_id: int = Field(foreign_key="requirement.id", index=True)
    title: str
    expected_result: str = Field(default="")
    status: TestStatus = Field(default=TestStatus.NOT_RUN)


class Deployment(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: int = Field(foreign_key="project.id", index=True)
    sprint_id: Optional[int] = Field(default=None, foreign_key="sprint.id")
    version: str
    environment: Environment = Field(default=Environment.DEV)
    status: DeploymentStatus = Field(default=DeploymentStatus.PENDING)
    created_at: datetime = Field(default_factory=utcnow)


class DeploymentRequirement(SQLModel, table=True):
    deployment_id: int = Field(foreign_key="deployment.id", primary_key=True)
    requirement_id: int = Field(foreign_key="requirement.id", primary_key=True)


class RiskPrediction(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    sprint_id: int = Field(foreign_key="sprint.id", index=True)
    risk_score: float
    risk_level: RiskLevel
    created_at: datetime = Field(default_factory=utcnow)

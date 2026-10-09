"""Demo data for IntelliSDLC.

Runs automatically on startup when the database has no users.
Reset manually with:  python -m app.seed --reset
"""
import sys
from datetime import date, datetime, timedelta

from sqlmodel import Session, SQLModel, select

from .config import BASE_DIR
from .database import engine, init_db
from .models import (
    Bug,
    BugStatus,
    Deployment,
    DeploymentRequirement,
    DeploymentStatus,
    Environment,
    Priority,
    Project,
    ProjectStatus,
    Repository,
    Requirement,
    RequirementStatus,
    RequirementType,
    RequirementVersion,
    Role,
    Sprint,
    SprintStatus,
    Task,
    TaskStatus,
    TaskType,
    TestCase,
    TestStatus,
    TimeLog,
    User,
)
from .security import hash_password

DEMO_PASSWORD = "Demo@123"

USERS = [
    ("Mihir Bhati", "admin@intellisdlc.dev", Role.ADMIN, "Platform, Architecture", 40),
    ("Priya Nair", "pm@intellisdlc.dev", Role.PROJECT_MANAGER, "Planning, Stakeholders", 40),
    ("Aarav Mehta", "aarav@intellisdlc.dev", Role.DEVELOPER, "Python, FastAPI, Auth", 40),
    ("Diya Sharma", "diya@intellisdlc.dev", Role.DEVELOPER, "React, TypeScript, UI", 40),
    ("Kabir Singh", "kabir@intellisdlc.dev", Role.DEVELOPER, "Payments, Integrations", 40),
    ("Rahul Verma", "qa@intellisdlc.dev", Role.QA_ENGINEER, "Manual QA, API testing", 40),
]

REQUIREMENTS = [
    (
        "REQ-101",
        "User login and authentication",
        "Registered users sign in with email and password and receive a session token.",
        RequirementType.FUNCTIONAL,
        Priority.HIGH,
        RequirementStatus.DEPLOYED,
        "DS-101 Authentication flow diagram",
    ),
    (
        "REQ-102",
        "Product search with filters",
        "Shoppers search the catalogue by keyword and narrow results by category, price and rating.",
        RequirementType.FUNCTIONAL,
        Priority.HIGH,
        RequirementStatus.TESTED,
        "DS-102 Search service design",
    ),
    (
        "REQ-103",
        "Online payments at checkout",
        "Checkout accepts card payments through the gateway and records the transaction result.",
        RequirementType.FUNCTIONAL,
        Priority.CRITICAL,
        RequirementStatus.IN_DEVELOPMENT,
        None,
    ),
    (
        "REQ-104",
        "Order tracking",
        "Customers follow an order from confirmation through dispatch to delivery.",
        RequirementType.FUNCTIONAL,
        Priority.MEDIUM,
        RequirementStatus.IN_DEVELOPMENT,
        None,
    ),
    (
        "REQ-105",
        "Shopping cart",
        "Shoppers add, update and remove items; the cart survives a sign-out.",
        RequirementType.FUNCTIONAL,
        Priority.HIGH,
        RequirementStatus.TESTED,
        "DS-105 Cart data model",
    ),
    (
        "REQ-106",
        "Product reviews and ratings",
        "Verified buyers rate a product out of five and leave a short written review.",
        RequirementType.FUNCTIONAL,
        Priority.LOW,
        RequirementStatus.APPROVED,
        None,
    ),
    (
        "REQ-107",
        "Inventory accuracy under load",
        "Stock counts stay accurate with 500 concurrent checkouts; no overselling.",
        RequirementType.NON_FUNCTIONAL,
        Priority.MEDIUM,
        RequirementStatus.DRAFT,
        None,
    ),
    (
        "REQ-108",
        "Transactional email notifications",
        "Order confirmation, dispatch and delivery emails are sent within one minute.",
        RequirementType.FUNCTIONAL,
        Priority.LOW,
        RequirementStatus.UNDER_REVIEW,
        None,
    ),
]

# (sprint_number, req_code, title, type, estimate, status, assignee_email, days_ago_completed)
TASKS = [
    (1, "REQ-101", "Design login and auth flow", TaskType.DESIGN, 8, TaskStatus.DONE, "aarav@intellisdlc.dev", 54),
    (1, "REQ-101", "Implement JWT login API", TaskType.DEVELOPMENT, 16, TaskStatus.DONE, "aarav@intellisdlc.dev", 50),
    (1, "REQ-101", "Build login screen", TaskType.DEVELOPMENT, 12, TaskStatus.DONE, "diya@intellisdlc.dev", 48),
    (1, "REQ-101", "Test login and lockout flows", TaskType.TESTING, 6, TaskStatus.DONE, "qa@intellisdlc.dev", 45),
    (1, "REQ-105", "Design cart data model", TaskType.DESIGN, 6, TaskStatus.DONE, "diya@intellisdlc.dev", 52),
    (1, "REQ-105", "Cart service endpoints", TaskType.DEVELOPMENT, 14, TaskStatus.DONE, "diya@intellisdlc.dev", 46),
    (1, "REQ-102", "Design search index approach", TaskType.DESIGN, 8, TaskStatus.DONE, "kabir@intellisdlc.dev", 47),
    (1, "REQ-105", "Test cart operations", TaskType.TESTING, 5, TaskStatus.DONE, "qa@intellisdlc.dev", 44),
    (2, "REQ-102", "Implement product search API", TaskType.DEVELOPMENT, 16, TaskStatus.DONE, "kabir@intellisdlc.dev", 34),
    (2, "REQ-102", "Search results UI", TaskType.DEVELOPMENT, 12, TaskStatus.DONE, "diya@intellisdlc.dev", 32),
    (2, "REQ-102", "Test search and filters", TaskType.TESTING, 8, TaskStatus.DONE, "qa@intellisdlc.dev", 30),
    (2, "REQ-105", "Cart UI and quantity updates", TaskType.DEVELOPMENT, 12, TaskStatus.DONE, "diya@intellisdlc.dev", 33),
    (2, "REQ-105", "Cart persistence across sessions", TaskType.DEVELOPMENT, 10, TaskStatus.DONE, "aarav@intellisdlc.dev", 31),
    (2, "REQ-104", "Design order tracking states", TaskType.DESIGN, 6, TaskStatus.TODO, "kabir@intellisdlc.dev", None),
    (2, "REQ-102", "Harden search filter edge cases", TaskType.DEVELOPMENT, 8, TaskStatus.BLOCKED, "kabir@intellisdlc.dev", None),
    (2, "REQ-108", "Design email notification templates", TaskType.DESIGN, 4, TaskStatus.TODO, "diya@intellisdlc.dev", None),
    (3, "REQ-103", "Design payment gateway integration", TaskType.DESIGN, 8, TaskStatus.DONE, "kabir@intellisdlc.dev", 8),
    (3, "REQ-101", "Add two-factor step to login", TaskType.DEVELOPMENT, 8, TaskStatus.DONE, "aarav@intellisdlc.dev", 5),
    (3, "REQ-103", "Payment gateway client", TaskType.DEVELOPMENT, 20, TaskStatus.IN_PROGRESS, "kabir@intellisdlc.dev", None),
    (3, "REQ-103", "Checkout payment UI", TaskType.DEVELOPMENT, 16, TaskStatus.IN_PROGRESS, "kabir@intellisdlc.dev", None),
    (3, "REQ-103", "Refund and chargeback handling", TaskType.DEVELOPMENT, 12, TaskStatus.BLOCKED, "kabir@intellisdlc.dev", None),
    (3, "REQ-103", "Test payment success and failure paths", TaskType.TESTING, 10, TaskStatus.TODO, "qa@intellisdlc.dev", None),
    (3, "REQ-104", "Order tracking API", TaskType.DEVELOPMENT, 14, TaskStatus.TODO, "kabir@intellisdlc.dev", None),
    (3, "REQ-104", "Order tracking screen", TaskType.DEVELOPMENT, 12, TaskStatus.TODO, "diya@intellisdlc.dev", None),
    (4, "REQ-106", "Review submission API", TaskType.DEVELOPMENT, 10, TaskStatus.TODO, "aarav@intellisdlc.dev", None),
    (4, "REQ-107", "Inventory sync background job", TaskType.DEVELOPMENT, 8, TaskStatus.TODO, "diya@intellisdlc.dev", None),
]

# (bug_code, title, req_code, sprint_number, severity, status, assignee_email)
BUGS = [
    ("BUG-101", "Payment confirmation times out after 30s", "REQ-103", 3, Priority.CRITICAL, BugStatus.OPEN, "kabir@intellisdlc.dev"),
    ("BUG-102", "Search filter resets when paginating", "REQ-102", 2, Priority.HIGH, BugStatus.IN_PROGRESS, "kabir@intellisdlc.dev"),
    ("BUG-103", "Card number field accepts letters", "REQ-103", 3, Priority.CRITICAL, BugStatus.OPEN, "diya@intellisdlc.dev"),
    ("BUG-104", "Order status stuck on Processing", "REQ-104", 3, Priority.MEDIUM, BugStatus.ASSIGNED, "kabir@intellisdlc.dev"),
    ("BUG-105", "Typo on login screen subtitle", "REQ-101", 1, Priority.LOW, BugStatus.CLOSED, "diya@intellisdlc.dev"),
]

# (test_code, req_code, title, expected_result, status)
TEST_CASES = [
    ("TC-101", "REQ-101", "Login with valid credentials", "User reaches the dashboard with a valid token", TestStatus.PASSED),
    ("TC-102", "REQ-101", "Login with wrong password", "Request is rejected with 401 and an error message", TestStatus.PASSED),
    ("TC-103", "REQ-103", "Pay with a valid test card", "Payment is captured and the order is confirmed", TestStatus.FAILED),
    ("TC-104", "REQ-102", "Search by product keyword", "Matching products are listed by relevance", TestStatus.PASSED),
    ("TC-105", "REQ-102", "Filter search results by price", "Only products inside the price range are shown", TestStatus.FAILED),
    ("TC-106", "REQ-105", "Add an item to the cart", "Cart count and total update immediately", TestStatus.PASSED),
    ("TC-107", "REQ-104", "Track a dispatched order", "Tracking page shows the dispatched state", TestStatus.NOT_RUN),
]

# (version, environment, status, sprint_number, [req_codes], days_ago)
DEPLOYMENTS = [
    ("v1.0.0", Environment.DEV, DeploymentStatus.SUCCESS, 1, ["REQ-101"], 44),
    ("v1.1.0", Environment.STAGING, DeploymentStatus.SUCCESS, 2, ["REQ-101", "REQ-102", "REQ-105"], 29),
    ("v1.2.0", Environment.PRODUCTION, DeploymentStatus.SUCCESS, 2, ["REQ-101"], 26),
    ("v1.3.0", Environment.STAGING, DeploymentStatus.FAILED, 3, ["REQ-103"], 3),
]


def _sprints(today: date) -> list[dict]:
    return [
        {
            "sprint_number": 1,
            "name": "Sprint 1 - Foundation",
            "goal": "Authentication and the shopping cart core",
            "start_date": today - timedelta(days=56),
            "end_date": today - timedelta(days=42),
            "status": SprintStatus.COMPLETED,
        },
        {
            "sprint_number": 2,
            "name": "Sprint 2 - Search & Cart",
            "goal": "Product search, filters and cart persistence",
            "start_date": today - timedelta(days=41),
            "end_date": today - timedelta(days=27),
            "status": SprintStatus.COMPLETED,
        },
        {
            "sprint_number": 3,
            "name": "Sprint 3 - Payments",
            "goal": "Card payments at checkout and order tracking",
            "start_date": today - timedelta(days=10),
            "end_date": today + timedelta(days=4),
            "status": SprintStatus.ACTIVE,
        },
        {
            "sprint_number": 4,
            "name": "Sprint 4 - Polish",
            "goal": "Reviews and inventory accuracy",
            "start_date": today + timedelta(days=5),
            "end_date": today + timedelta(days=19),
            "status": SprintStatus.PLANNED,
        },
    ]


def seed(session: Session) -> None:
    today = date.today()
    password_hash = hash_password(DEMO_PASSWORD)

    users: dict[str, User] = {}
    for full_name, email, role, skills, capacity in USERS:
        user = User(
            full_name=full_name,
            email=email,
            password_hash=password_hash,
            role=role,
            is_active=True,
            skills=skills,
            capacity_hours=capacity,
        )
        session.add(user)
        users[email] = user
    session.commit()

    project = Project(
        name="ShopEase - E-commerce Platform",
        description="Online storefront covering catalogue, cart, checkout and order tracking.",
        status=ProjectStatus.ACTIVE,
    )
    session.add(project)
    session.commit()
    session.refresh(project)

    pm = users["pm@intellisdlc.dev"]
    requirements: dict[str, Requirement] = {}
    for code, title, description, req_type, priority, req_status, design_ref in REQUIREMENTS:
        requirement = Requirement(
            req_code=code,
            project_id=project.id,
            title=title,
            description=description,
            type=req_type,
            priority=priority,
            status=req_status,
            owner_id=pm.id,
            version=1,
            design_reference=design_ref,
        )
        session.add(requirement)
        requirements[code] = requirement
    session.commit()

    sprints: dict[int, Sprint] = {}
    for data in _sprints(today):
        sprint = Sprint(project_id=project.id, **data)
        session.add(sprint)
        sprints[data["sprint_number"]] = sprint
    session.commit()

    # REQ-103 carries three versions, the last two raised inside the active sprint.
    sprint3_start = sprints[3].start_date
    payments = requirements["REQ-103"]
    payments.version = 3
    session.add(payments)
    history = [
        (1, "Created", datetime.combine(today - timedelta(days=50), datetime.min.time())),
        (
            2,
            "priority: HIGH -> CRITICAL; description updated (UPI and wallets added to scope)",
            datetime.combine(sprint3_start + timedelta(days=2), datetime.min.time()),
        ),
        (
            3,
            "status: APPROVED -> IN_DEVELOPMENT; description updated (refund flow added)",
            datetime.combine(sprint3_start + timedelta(days=5), datetime.min.time()),
        ),
    ]
    for version, summary, created_at in history:
        session.add(
            RequirementVersion(
                requirement_id=payments.id,
                version=version,
                changed_by=pm.id,
                summary=summary,
                created_at=created_at,
            )
        )
    for code, requirement in requirements.items():
        if code == "REQ-103":
            continue
        session.add(
            RequirementVersion(
                requirement_id=requirement.id,
                version=1,
                changed_by=pm.id,
                summary="Created",
                created_at=datetime.combine(today - timedelta(days=55), datetime.min.time()),
            )
        )
    # One more change inside Sprint 3 so the risk feature has something to count.
    tracking = requirements["REQ-104"]
    tracking.version = 2
    session.add(tracking)
    session.add(
        RequirementVersion(
            requirement_id=tracking.id,
            version=2,
            changed_by=pm.id,
            summary="priority: LOW -> MEDIUM",
            created_at=datetime.combine(sprint3_start + timedelta(days=4), datetime.min.time()),
        )
    )
    session.commit()

    tasks: list[Task] = []
    for sprint_number, req_code, title, task_type, estimate, task_status, email, days_ago in TASKS:
        completed_at = (
            datetime.combine(today - timedelta(days=days_ago), datetime.min.time())
            if days_ago is not None
            else None
        )
        task = Task(
            sprint_id=sprints[sprint_number].id,
            requirement_id=requirements[req_code].id,
            title=title,
            task_type=task_type,
            estimate_hours=estimate,
            status=task_status,
            assigned_to=users[email].id,
            completed_at=completed_at,
        )
        session.add(task)
        tasks.append(task)
    session.commit()

    for bug_code, title, req_code, sprint_number, severity, bug_status, email in BUGS:
        session.add(
            Bug(
                bug_code=bug_code,
                project_id=project.id,
                requirement_id=requirements[req_code].id,
                sprint_id=sprints[sprint_number].id,
                title=title,
                severity=severity,
                status=bug_status,
                assignee_id=users[email].id,
            )
        )

    for test_code, req_code, title, expected, test_status in TEST_CASES:
        session.add(
            TestCase(
                test_code=test_code,
                requirement_id=requirements[req_code].id,
                title=title,
                expected_result=expected,
                status=test_status,
            )
        )
    session.commit()

    for version, environment, dep_status, sprint_number, req_codes, days_ago in DEPLOYMENTS:
        deployment = Deployment(
            project_id=project.id,
            sprint_id=sprints[sprint_number].id,
            version=version,
            environment=environment,
            status=dep_status,
            created_at=datetime.combine(today - timedelta(days=days_ago), datetime.min.time()),
        )
        session.add(deployment)
        session.commit()
        session.refresh(deployment)
        for code in req_codes:
            session.add(
                DeploymentRequirement(
                    deployment_id=deployment.id, requirement_id=requirements[code].id
                )
            )
    session.commit()

    _seed_repository(session, project)

    # A few time logs so developer effort is not empty.
    done_dev_tasks = [t for t in tasks if t.status == TaskStatus.DONE and t.assigned_to]
    for task in done_dev_tasks[:8]:
        session.add(
            TimeLog(
                task_id=task.id,
                developer_id=task.assigned_to,
                hours=float(task.estimate_hours),
                date=(task.completed_at.date() if task.completed_at else today),
            )
        )
    session.commit()


def _seed_repository(session: Session, project: Project) -> None:
    """Point the demo project at IntelliSDLC's own working copy.

    Nothing is read from git here - registering the path is enough. Pressing
    Sync on the Code page then pulls this project's real commit history in,
    which is a more honest demonstration than inventing commits.
    """
    repo_root = BASE_DIR.parent
    if not (repo_root / ".git").exists():
        return
    session.add(
        Repository(
            project_id=project.id,
            name="IntelliSDLC (this project)",
            path=str(repo_root),
        )
    )
    session.commit()


def seed_if_empty() -> bool:
    with Session(engine) as session:
        if session.exec(select(User)).first() is not None:
            return False
        seed(session)
        return True


def reset() -> None:
    init_db()
    SQLModel.metadata.drop_all(engine)
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        seed(session)


if __name__ == "__main__":
    if "--reset" in sys.argv:
        reset()
        print("database reset and reseeded")
    else:
        init_db()
        created = seed_if_empty()
        print("seeded" if created else "already seeded (use --reset to rebuild)")

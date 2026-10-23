from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

import models
import schemas
from database import Base, engine, get_db


Base.metadata.create_all(bind=engine)

app = FastAPI(title="ProjectFlow - Project Management System")

BASE_DIR = Path(__file__).resolve().parent

app.mount(
    "/static",
    StaticFiles(directory=BASE_DIR / "static", check_dir=False),
    name="static",
)


def get_record(db: Session, model, record_id: int, label: str):
    record = db.query(model).filter(model.id == record_id).first()

    if record is None:
        raise HTTPException(status_code=404, detail=f"{label} not found")

    return record


def handle_db_error(db: Session, error: SQLAlchemyError):
    db.rollback()

    if isinstance(error, IntegrityError):
        raise HTTPException(
            status_code=409,
            detail="Operation conflicts with existing data",
        )

    raise HTTPException(status_code=500, detail="Database operation failed")


def save_record(db: Session, record):
    try:
        db.add(record)
        db.commit()
        db.refresh(record)
        return record
    except SQLAlchemyError as error:
        handle_db_error(db, error)


def commit_changes(db: Session):
    try:
        db.commit()
    except SQLAlchemyError as error:
        handle_db_error(db, error)


def validate_project_owner(db: Session, owner_id: int | None):
    if owner_id is not None:
        get_record(db, models.User, owner_id, "Project owner")


def validate_task_references(
    db: Session,
    project_id: int,
    assigned_to: int | None,
):
    get_record(db, models.Project, project_id, "Project")

    if assigned_to is not None:
        get_record(db, models.User, assigned_to, "Assigned user")


def validate_milestone_project(db: Session, project_id: int):
    get_record(db, models.Project, project_id, "Project")


def ensure_milestone_is_unique(
    db: Session,
    title: str,
    project_id: int,
    exclude_id: int | None = None,
):
    query = db.query(models.Milestone).filter(
        models.Milestone.title == title,
        models.Milestone.project_id == project_id,
    )

    if exclude_id is not None:
        query = query.filter(models.Milestone.id != exclude_id)

    if query.first():
        raise HTTPException(
            status_code=409,
            detail="A milestone with this title already exists in this project",
        )


# HOME

@app.get("/", response_class=HTMLResponse)
def home():
    html_file = BASE_DIR / "templates" / "index.html"
    return html_file.read_text(encoding="utf-8")


# USERS / TEAM MEMBERS

@app.post(
    "/users",
    response_model=schemas.UserResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    existing_user = (
        db.query(models.User)
        .filter(models.User.email == user.email)
        .first()
    )

    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    return save_record(db, models.User(**user.model_dump()))


@app.get("/users", response_model=list[schemas.UserResponse])
def get_users(db: Session = Depends(get_db)):
    return db.query(models.User).all()


@app.get("/users/{user_id}", response_model=schemas.UserResponse)
def get_user(user_id: int, db: Session = Depends(get_db)):
    return get_record(db, models.User, user_id, "User")


@app.put("/users/{user_id}", response_model=schemas.UserResponse)
def update_user(
    user_id: int,
    user_data: schemas.UserCreate,
    db: Session = Depends(get_db),
):
    user = get_record(db, models.User, user_id, "User")

    existing_user = (
        db.query(models.User)
        .filter(
            models.User.email == user_data.email,
            models.User.id != user_id,
        )
        .first()
    )

    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    user.name = user_data.name
    user.email = user_data.email
    user.role = user_data.role

    commit_changes(db)
    db.refresh(user)

    return user


@app.delete("/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db)):
    user = get_record(db, models.User, user_id, "User")

    if user.projects:
        raise HTTPException(
            status_code=409,
            detail="Cannot delete a user who owns projects. Reassign the projects first.",
        )

    if user.tasks:
        raise HTTPException(
            status_code=409,
            detail="Cannot delete a user assigned to tasks. Reassign the tasks first.",
        )

    db.delete(user)
    commit_changes(db)

    return {"message": "User deleted successfully"}


# PROJECTS

@app.post(
    "/projects",
    response_model=schemas.ProjectResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_project(
    project: schemas.ProjectCreate,
    db: Session = Depends(get_db),
):
    validate_project_owner(db, project.owner_id)

    return save_record(db, models.Project(**project.model_dump()))


@app.get("/projects", response_model=list[schemas.ProjectResponse])
def get_projects(db: Session = Depends(get_db)):
    return db.query(models.Project).all()


@app.get("/projects/{project_id}", response_model=schemas.ProjectResponse)
def get_project(project_id: int, db: Session = Depends(get_db)):
    return get_record(db, models.Project, project_id, "Project")


@app.put("/projects/{project_id}", response_model=schemas.ProjectResponse)
def update_project(
    project_id: int,
    project_data: schemas.ProjectCreate,
    db: Session = Depends(get_db),
):
    project = get_record(db, models.Project, project_id, "Project")
    validate_project_owner(db, project_data.owner_id)

    for key, value in project_data.model_dump().items():
        setattr(project, key, value)

    commit_changes(db)
    db.refresh(project)

    return project


@app.delete("/projects/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db)):
    project = get_record(db, models.Project, project_id, "Project")

    db.delete(project)
    commit_changes(db)

    return {"message": "Project deleted successfully"}


# TASKS

@app.post(
    "/tasks",
    response_model=schemas.TaskResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_task(task: schemas.TaskCreate, db: Session = Depends(get_db)):
    validate_task_references(db, task.project_id, task.assigned_to)

    return save_record(db, models.Task(**task.model_dump()))


@app.get("/tasks", response_model=list[schemas.TaskResponse])
def get_tasks(db: Session = Depends(get_db)):
    return db.query(models.Task).all()


@app.get("/tasks/{task_id}", response_model=schemas.TaskResponse)
def get_task(task_id: int, db: Session = Depends(get_db)):
    return get_record(db, models.Task, task_id, "Task")


@app.put("/tasks/{task_id}", response_model=schemas.TaskResponse)
def update_task(
    task_id: int,
    task_data: schemas.TaskCreate,
    db: Session = Depends(get_db),
):
    task = get_record(db, models.Task, task_id, "Task")
    validate_task_references(db, task_data.project_id, task_data.assigned_to)

    for key, value in task_data.model_dump().items():
        setattr(task, key, value)

    commit_changes(db)
    db.refresh(task)

    return task


@app.delete("/tasks/{task_id}")
def delete_task(task_id: int, db: Session = Depends(get_db)):
    task = get_record(db, models.Task, task_id, "Task")

    db.delete(task)
    commit_changes(db)

    return {"message": "Task deleted successfully"}


# MILESTONES

@app.post(
    "/milestones",
    response_model=schemas.MilestoneResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_milestone(
    milestone: schemas.MilestoneCreate,
    db: Session = Depends(get_db),
):
    validate_milestone_project(db, milestone.project_id)
    ensure_milestone_is_unique(db, milestone.title, milestone.project_id)

    return save_record(db, models.Milestone(**milestone.model_dump()))


@app.get("/milestones", response_model=list[schemas.MilestoneResponse])
def get_milestones(db: Session = Depends(get_db)):
    return db.query(models.Milestone).all()


@app.get(
    "/milestones/{milestone_id}",
    response_model=schemas.MilestoneResponse,
)
def get_milestone(milestone_id: int, db: Session = Depends(get_db)):
    return get_record(db, models.Milestone, milestone_id, "Milestone")


@app.put(
    "/milestones/{milestone_id}",
    response_model=schemas.MilestoneResponse,
)
def update_milestone(
    milestone_id: int,
    milestone_data: schemas.MilestoneCreate,
    db: Session = Depends(get_db),
):
    milestone = get_record(db, models.Milestone, milestone_id, "Milestone")
    validate_milestone_project(db, milestone_data.project_id)
    ensure_milestone_is_unique(
        db,
        milestone_data.title,
        milestone_data.project_id,
        exclude_id=milestone_id,
    )

    for key, value in milestone_data.model_dump().items():
        setattr(milestone, key, value)

    commit_changes(db)
    db.refresh(milestone)

    return milestone


@app.delete("/milestones/{milestone_id}")
def delete_milestone(milestone_id: int, db: Session = Depends(get_db)):
    milestone = get_record(db, models.Milestone, milestone_id, "Milestone")

    db.delete(milestone)
    commit_changes(db)

    return {"message": "Milestone deleted successfully"}


# DASHBOARD

@app.get("/dashboard")
def dashboard(db: Session = Depends(get_db)):
    total_projects = db.query(models.Project).count()
    total_tasks = db.query(models.Task).count()
    total_milestones = db.query(models.Milestone).count()

    completed_tasks = (
        db.query(models.Task)
        .filter(models.Task.status == "Completed")
        .count()
    )

    completed_milestones = (
        db.query(models.Milestone)
        .filter(models.Milestone.status == "Completed")
        .count()
    )

    progress = (
        round(completed_tasks / total_tasks * 100, 1)
        if total_tasks
        else 0
    )

    return {
        "total_projects": total_projects,
        "total_tasks": total_tasks,
        "completed_tasks": completed_tasks,
        "pending_tasks": total_tasks - completed_tasks,
        "total_milestones": total_milestones,
        "completed_milestones": completed_milestones,
        "pending_milestones": total_milestones - completed_milestones,
        "progress": progress,
    }
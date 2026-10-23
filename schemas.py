from datetime import date
from pydantic import BaseModel, ConfigDict


class UserBase(BaseModel):
    name: str
    email: str
    role: str = "Member"


class UserCreate(UserBase):
    pass


class UserResponse(UserBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


class ProjectBase(BaseModel):
    name: str
    description: str | None = None
    status: str = "Planning"
    start_date: date | None = None
    deadline: date | None = None
    owner_id: int | None = None


class ProjectCreate(ProjectBase):
    pass


class ProjectResponse(ProjectBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


class TaskBase(BaseModel):
    title: str
    description: str | None = None
    status: str = "To Do"
    priority: str = "Medium"
    deadline: date | None = None
    project_id: int
    assigned_to: int | None = None


class TaskCreate(TaskBase):
    pass


class TaskResponse(TaskBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


class MilestoneBase(BaseModel):
    title: str
    deadline: date | None = None
    status: str = "Pending"
    project_id: int


class MilestoneCreate(MilestoneBase):
    pass


class MilestoneResponse(MilestoneBase):
    id: int

    model_config = ConfigDict(from_attributes=True)
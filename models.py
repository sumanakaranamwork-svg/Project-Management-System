from sqlalchemy import Column, Integer, String, Text, Date, ForeignKey
from sqlalchemy.orm import relationship

from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(150), unique=True, nullable=False)
    role = Column(String(50), default="Member")

    projects = relationship("Project", back_populates="owner")
    tasks = relationship("Task", back_populates="assignee")


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    description = Column(Text)
    status = Column(String(50), default="Planning")
    start_date = Column(Date)
    deadline = Column(Date)
    owner_id = Column(Integer, ForeignKey("users.id"))

    owner = relationship("User", back_populates="projects")
    tasks = relationship("Task", back_populates="project", cascade="all, delete-orphan")
    milestones = relationship(
        "Milestone",
        back_populates="project",
        cascade="all, delete-orphan"
    )


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text)
    status = Column(String(50), default="To Do")
    priority = Column(String(50), default="Medium")
    deadline = Column(Date)
    project_id = Column(Integer, ForeignKey("projects.id"))
    assigned_to = Column(Integer, ForeignKey("users.id"))

    project = relationship("Project", back_populates="tasks")
    assignee = relationship("User", back_populates="tasks")


class Milestone(Base):
    __tablename__ = "milestones"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    deadline = Column(Date)
    status = Column(String(50), default="Pending")
    project_id = Column(Integer, ForeignKey("projects.id"))

    project = relationship("Project", back_populates="milestones")
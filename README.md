# ProjectFlow

A project management and workflow system for tracking projects, tasks, milestones, and team members.

## Features

- Dashboard with project, task, and milestone counts and an overall progress bar
- Projects, tasks, milestones, and team members: create, edit, delete
- Task assignment to team members, with priority and status tracking
- Overdue highlighting for tasks and milestones past their deadline
- Upcoming Milestones panel showing the next incomplete milestones
- Validation: unique team member emails, unique milestone titles per project, and blocked deletion of members who own projects or tasks

## Tech Stack

- Backend: Python, FastAPI, SQLAlchemy
- Database: SQLite
- Frontend: HTML, CSS, JavaScript
- Server: Uvicorn

## Project Structure

```
Project-Management-System/
├── main.py
├── models.py
├── schemas.py
├── database.py
├── templates/
│   └── index.html
└── static/
    ├── script.js
    └── style.css
```

## Setup

1. Clone the repository and open the folder.
2. Create and activate a virtual environment:

   ```
   python -m venv venv
   venv\Scripts\activate
   ```

3. Install dependencies:

   ```
   pip install fastapi uvicorn sqlalchemy
   ```

4. Start the server:

   ```
   uvicorn main:app --reload
   ```

5. Open http://127.0.0.1:8000 in your browser.

API documentation is available at http://127.0.0.1:8000/docs.

## Usage

1. Add team members on the Team page.
2. Create a project and assign an owner.
3. Add tasks and milestones to the project.
4. Update task and milestone statuses as work progresses.
5. Track progress and overdue items on the Dashboard.

## API Endpoints

| Resource | Endpoints |
|----------|-----------|
| Users | `GET/POST /users`, `GET/PUT/DELETE /users/{id}` |
| Projects | `GET/POST /projects`, `GET/PUT/DELETE /projects/{id}` |
| Tasks | `GET/POST /tasks`, `GET/PUT/DELETE /tasks/{id}` |
| Milestones | `GET/POST /milestones`, `GET/PUT/DELETE /milestones/{id}` |
| Dashboard | `GET /dashboard` |

## Author

Karanam Naga Sumana

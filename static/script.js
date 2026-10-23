const API = {
    dashboard: "/dashboard",
    projects: "/projects",
    tasks: "/tasks",
    milestones: "/milestones",
    users: "/users"
};

const state = {
    projects: [],
    tasks: [],
    milestones: [],
    users: [],
    editing: null,
    deleting: false,
    currentView: "dashboard"
};

const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

function displayDate(value) {
    return value || "Not set";
}

function statusClass(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}

// ---------- Overdue helpers ----------

function startOfToday() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function parseLocalDate(value) {
    const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
}

function overdueDays(item) {
    if (!item.deadline || item.status === "Completed") return 0;

    const deadline = parseLocalDate(item.deadline);
    if (!deadline) return 0;

    const diff = Math.round((startOfToday() - deadline) / 86400000);
    return diff > 0 ? diff : 0;
}

function overdueBadge(item) {
    const days = overdueDays(item);
    if (!days) return "";
    return `<span class="badge overdue">Overdue by ${days} day${days === 1 ? "" : "s"}</span>`;
}

function deadlineBadge(item) {
    const overdueClass = overdueDays(item) ? " overdue-text" : "";
    return `<span class="badge${overdueClass}">Deadline: ${escapeHtml(displayDate(item.deadline))}</span>`;
}

function itemClass(item) {
    return overdueDays(item) ? "data-item overdue" : "data-item";
}

// ---------- UI helpers ----------

function showNotice(message, isError = false) {
    const notice = $("notice");
    notice.textContent = message;
    notice.classList.toggle("error", isError);
    notice.hidden = false;

    window.clearTimeout(showNotice.timeout);
    showNotice.timeout = window.setTimeout(() => {
        notice.hidden = true;
    }, 4500);
}

async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: {
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...options.headers
        }
    });

    if (!response.ok) {
        let message = `Request failed (${response.status})`;
        try {
            const error = await response.json();
            message = error.detail || error.message || message;
            if (Array.isArray(message)) {
                message = message.map(item => item.msg).join(", ");
            }
        } catch {
            // Keep the default error message.
        }
        throw new Error(message);
    }

    if (response.status === 204) return null;

    const text = await response.text();
    return text ? JSON.parse(text) : null;
}

async function refreshData() {
    const results = await Promise.allSettled([
        apiRequest(API.projects),
        apiRequest(API.tasks),
        apiRequest(API.milestones),
        apiRequest(API.users)
    ]);

    const names = ["projects", "tasks", "milestones", "users"];
    const errors = [];

    results.forEach((result, index) => {
        if (result.status === "fulfilled") {
            state[names[index]] = result.value;
        } else {
            errors.push(`${names[index]}: ${result.reason.message}`);
        }
    });

    renderAll();

    if (errors.length) {
        showNotice("Some data could not be loaded. " + errors.join("; "), true);
    }
}

async function loadMilestones() {
    try {
        state.milestones = await apiRequest(API.milestones);
        renderMilestoneViews();
    } catch (error) {
        console.error("Milestones error:", error);
        showNotice("Could not load milestones: " + error.message, true);
    }
}

async function loadDashboard() {
    try {
        const data = await apiRequest(API.dashboard);

        $("total-projects").textContent = data.total_projects ?? 0;
        $("total-tasks").textContent = data.total_tasks ?? 0;
        $("completed-tasks").textContent = data.completed_tasks ?? 0;
        $("pending-tasks").textContent = data.pending_tasks ?? 0;
        $("total-milestones").textContent = data.total_milestones ?? 0;

        const progress = Math.min(100, Math.max(0, Number(data.progress) || 0));
        $("progress-label").textContent = `${progress}%`;
        $("progress-fill").style.width = `${progress}%`;

        const summary = $("completed-summary");
        if (summary) {
            summary.textContent =
                `${data.completed_tasks ?? 0} of ${data.total_tasks ?? 0} tasks completed`;
        }
    } catch (error) {
        showNotice("Could not load dashboard: " + error.message, true);
    }
}

function projectName(projectId) {
    const project = state.projects.find(item => item.id === projectId);
    return project ? project.name : "Unknown project";
}

function userName(userId) {
    const user = state.users.find(item => item.id === userId);
    return user ? user.name : "Unassigned";
}

function renderProjects(targetId, projects) {
    const target = $(targetId);
    if (!target) return;

    if (!projects.length) {
        target.innerHTML = '<p class="empty-state">No projects found. Create your first project to get started.</p>';
        return;
    }

    target.innerHTML = projects.map(project => `
        <article class="data-item">
            <h3>${escapeHtml(project.name)}</h3>
            <p>${escapeHtml(project.description || "No description available.")}</p>
            <div class="data-meta">
                <span class="badge status-${statusClass(project.status)}">${escapeHtml(project.status)}</span>
                <span class="badge">Deadline: ${escapeHtml(displayDate(project.deadline))}</span>
                <span class="badge">Owner: ${escapeHtml(userName(project.owner_id))}</span>
            </div>
            <div class="item-actions">
                <button class="small-btn" data-edit="project" data-id="${project.id}">Edit</button>
                <button class="small-btn danger" data-delete="project" data-id="${project.id}">Delete</button>
            </div>
        </article>
    `).join("");
}

function renderTasks(targetId, tasks) {
    const target = $(targetId);
    if (!target) return;

    if (!tasks.length) {
        target.innerHTML = '<p class="empty-state">No tasks found. Add a task to get started.</p>';
        return;
    }

    target.innerHTML = tasks.map(task => `
        <article class="${itemClass(task)}">
            <h3>${escapeHtml(task.title)}</h3>
            <p>${escapeHtml(task.description || "No description available.")}</p>
            <div class="data-meta">
                <span class="badge status-${statusClass(task.status)}">${escapeHtml(task.status)}</span>
                ${overdueBadge(task)}
                <span class="badge">Priority: ${escapeHtml(task.priority)}</span>
                <span class="badge">Project: ${escapeHtml(projectName(task.project_id))}</span>
                <span class="badge">Assigned: ${escapeHtml(userName(task.assigned_to))}</span>
                ${deadlineBadge(task)}
            </div>
            <div class="item-actions">
                <button class="small-btn" data-edit="task" data-id="${task.id}">Edit</button>
                <button class="small-btn danger" data-delete="task" data-id="${task.id}">Delete</button>
            </div>
        </article>
    `).join("");
}

function renderMilestones(targetId, milestones, emptyMessage) {
    const target = $(targetId);
    if (!target) return;

    if (!milestones.length) {
        target.innerHTML = `<p class="empty-state">${escapeHtml(emptyMessage || "No milestones found. Add your first milestone.")}</p>`;
        return;
    }

    target.innerHTML = milestones.map(item => `
        <article class="${itemClass(item)}">
            <h3>${escapeHtml(item.title)}</h3>
            <div class="data-meta">
                <span class="badge status-${statusClass(item.status)}">${escapeHtml(item.status)}</span>
                ${overdueBadge(item)}
                <span class="badge">Project: ${escapeHtml(projectName(item.project_id))}</span>
                ${deadlineBadge(item)}
            </div>
            <div class="item-actions">
                <button class="small-btn" data-edit="milestone" data-id="${item.id}">Edit</button>
                <button class="small-btn danger" data-delete="milestone" data-id="${item.id}">Delete</button>
            </div>
        </article>
    `).join("");
}

function upcomingMilestones() {
    return state.milestones
        .filter(item => item.status !== "Completed")
        .sort((a, b) => {
            const first = a.deadline || "9999-12-31";
            const second = b.deadline || "9999-12-31";
            return first.localeCompare(second);
        })
        .slice(0, 4);
}

function renderMilestoneViews() {
    renderMilestones(
        "milestones-preview-list",
        upcomingMilestones(),
        state.milestones.length
            ? "All milestones are completed. Nice work!"
            : "No milestones found. Add your first milestone."
    );
    renderMilestones("milestones-list", state.milestones);
}

function renderUsers() {
    const target = $("users-list");
    if (!target) return;

    if (!state.users.length) {
        target.innerHTML = '<p class="empty-state">No team members found. Add a member to assign project work.</p>';
        return;
    }

    target.innerHTML = state.users.map(user => `
        <article class="data-item">
            <h3>${escapeHtml(user.name)}</h3>
            <p>${escapeHtml(user.email)}</p>
            <div class="data-meta">
                <span class="badge">${escapeHtml(user.role)}</span>
            </div>
            <div class="item-actions">
                <button class="small-btn" data-edit="user" data-id="${user.id}">Edit</button>
                <button class="small-btn danger" data-delete="user" data-id="${user.id}">Delete</button>
            </div>
        </article>
    `).join("");
}

function renderAll() {
    renderProjects("projects-list", state.projects.slice(0, 4));
    renderProjects("all-projects-list", state.projects);
    renderTasks("tasks-list", state.tasks.slice(0, 5));
    renderTasks("all-tasks-list", state.tasks);
    renderMilestoneViews();
    renderUsers();
    loadDashboard();
}

function navigate(view) {
    const validViews = ["dashboard", "projects", "tasks", "milestones", "team"];
    if (!validViews.includes(view)) return;

    state.currentView = view;

    document.querySelectorAll(".view").forEach(section => {
        section.hidden = section.id !== `${view}-view`;
    });

    document.querySelectorAll("[data-view]").forEach(button => {
        button.classList.toggle("active", button.dataset.view === view);
    });

    const titles = {
        dashboard: "Dashboard",
        projects: "Projects",
        tasks: "Tasks",
        milestones: "Milestones",
        team: "Team Members"
    };

    $("page-title").textContent = titles[view];
    $("global-add").textContent = view === "dashboard" ? "+ Create New" : `+ Add ${view === "team" ? "Member" : view.slice(0, -1).replace(/^./, c => c.toUpperCase())}`;
}

const formDefinitions = {
    project: {
        title: "Project",
        endpoint: API.projects,
        fields: [
            { name: "name", label: "Project Name", required: true },
            { name: "description", label: "Description", type: "textarea" },
            { name: "status", label: "Status", type: "select", options: ["Planning", "Active", "On Hold", "Completed"], default: "Planning" },
            { name: "start_date", label: "Start Date", type: "date" },
            { name: "deadline", label: "Deadline", type: "date" },
            { name: "owner_id", label: "Project Owner", type: "select", optionsFrom: "users", optional: true }
        ]
    },
    task: {
        title: "Task",
        endpoint: API.tasks,
        fields: [
            { name: "title", label: "Task Title", required: true },
            { name: "description", label: "Description", type: "textarea" },
            { name: "project_id", label: "Project", type: "select", optionsFrom: "projects", required: true },
            { name: "assigned_to", label: "Assign To", type: "select", optionsFrom: "users", optional: true },
            { name: "status", label: "Status", type: "select", options: ["To Do", "In Progress", "Review", "Completed"], default: "To Do" },
            { name: "priority", label: "Priority", type: "select", options: ["Low", "Medium", "High"], default: "Medium" },
            { name: "deadline", label: "Deadline", type: "date" }
        ]
    },
    milestone: {
        title: "Milestone",
        endpoint: API.milestones,
        fields: [
            { name: "title", label: "Milestone Title", required: true },
            { name: "project_id", label: "Project", type: "select", optionsFrom: "projects", required: true },
            { name: "deadline", label: "Deadline", type: "date" },
            { name: "status", label: "Status", type: "select", options: ["Pending", "In Progress", "Completed"], default: "Pending" }
        ]
    },
    user: {
        title: "Team Member",
        endpoint: API.users,
        fields: [
            { name: "name", label: "Full Name", required: true },
            { name: "email", label: "Email", type: "email", required: true },
            { name: "role", label: "Role", type: "select", options: ["Member", "Admin", "Manager"], default: "Member" }
        ]
    }
};

function selectOptions(field) {
    let options = field.options || [];

    if (field.optionsFrom === "projects") {
        options = state.projects.map(item => ({
            value: item.id,
            label: item.name
        }));
    } else if (field.optionsFrom === "users") {
        options = state.users.map(item => ({
            value: item.id,
            label: item.name
        }));
    } else {
        options = options.map(value => ({ value, label: value }));
    }

    const blankOption = field.optional
        ? '<option value="">Unassigned</option>'
        : '<option value="">Select an option</option>';

    return blankOption + options.map(option => `
        <option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>
    `).join("");
}

function openForm(type, record = null) {
    const definition = formDefinitions[type];
    if (!definition) return;

    if ((type === "task" || type === "milestone") && !state.projects.length) {
        showNotice("Create a project first, then add a task or milestone.", true);
        navigate("projects");
        return;
    }

    state.editing = { type, id: record?.id ?? null };
    $("dialog-title").textContent = `${record ? "Edit" : "Create"} ${definition.title}`;
    $("save-record").textContent = record ? "Save Changes" : "Create " + definition.title;

    $("form-fields").innerHTML = definition.fields.map(field => {
        const value = record?.[field.name] ?? field.default ?? "";
        const required = field.required ? "required" : "";
        const safeValue = escapeHtml(value);

        if (field.type === "select") {
            return `
                <div class="form-group">
                    <label for="field-${field.name}">${field.label}</label>
                    <select id="field-${field.name}" name="${field.name}" ${required}>
                        ${selectOptions(field)}
                    </select>
                </div>`;
        }

        if (field.type === "textarea") {
            return `
                <div class="form-group">
                    <label for="field-${field.name}">${field.label}</label>
                    <textarea id="field-${field.name}" name="${field.name}" ${required}>${safeValue}</textarea>
                </div>`;
        }

        return `
            <div class="form-group">
                <label for="field-${field.name}">${field.label}</label>
                <input id="field-${field.name}" name="${field.name}"
                    type="${field.type || "text"}" value="${safeValue}" ${required}>
            </div>`;
    }).join("");

    // Set select values (existing record value first, then field default)
    definition.fields.forEach(field => {
        const input = $(`field-${field.name}`);
        if (!input) return;

        const value = record?.[field.name] ?? field.default;
        if (value != null) {
            input.value = value;
        }
    });

    $("record-dialog").showModal();
}

function closeForm() {
    $("record-dialog").close();
    $("record-form").reset();
    state.editing = null;
}

async function saveRecord(event) {
    event.preventDefault();

    if (!state.editing) return;

    const { type, id } = state.editing;
    const definition = formDefinitions[type];
    const formData = new FormData(event.currentTarget);
    const payload = {};

    for (const field of definition.fields) {
        let value = formData.get(field.name);

        if (value === "" || value === null) {
            value = null;
        } else if (["owner_id", "assigned_to", "project_id"].includes(field.name)) {
            value = Number(value);
        }

        payload[field.name] = value;
    }

    const url = id ? `${definition.endpoint}/${id}` : definition.endpoint;
    const method = id ? "PUT" : "POST";

    $("save-record").disabled = true;
    $("save-record").textContent = "Saving...";

    try {
        await apiRequest(url, {
            method,
            body: JSON.stringify(payload)
        });

        closeForm();
        await refreshData();
        showNotice(`${definition.title} ${id ? "updated" : "created"} successfully.`);
        navigate(type === "user" ? "team" : type === "milestone" ? "milestones" : `${type}s`);
    } catch (error) {
        showNotice(`Could not save ${definition.title.toLowerCase()}: ${error.message}`, true);
    } finally {
        $("save-record").disabled = false;
        $("save-record").textContent = id ? "Save Changes" : "Create " + definition.title;
    }
}

async function editRecord(type, id) {
    const collection = {
        project: state.projects,
        task: state.tasks,
        milestone: state.milestones,
        user: state.users
    }[type];

    const record = collection?.find(item => item.id === Number(id));
    if (!record) {
        showNotice("Record not found. Refreshing the data may help.", true);
        return;
    }

    openForm(type, record);
}

async function deleteRecord(type, id) {
    if (state.deleting) return;

    const definition = formDefinitions[type];
    const collection = {
        project: state.projects,
        task: state.tasks,
        milestone: state.milestones,
        user: state.users
    }[type];

    const record = collection?.find(item => item.id === Number(id));
    if (!record) return;

    const label = record.name || record.title;
    if (!window.confirm(`Delete "${label}"? This action cannot be undone.`)) return;

    state.deleting = true;
    let message = `${definition.title} deleted successfully.`;
    let isError = false;

    try {
        await apiRequest(`${definition.endpoint}/${id}`, { method: "DELETE" });
    } catch (error) {
        if (/not found/i.test(error.message)) {
            message = `${definition.title} was already deleted. The list has been refreshed.`;
        } else {
            message = `Could not delete record: ${error.message}`;
            isError = true;
        }
    } finally {
        state.deleting = false;
    }

    // Always reload so the screen matches the database.
    await refreshData();
    showNotice(message, isError);
}

document.addEventListener("click", event => {
    const navButton = event.target.closest("[data-view]");
    if (navButton) {
        navigate(navButton.dataset.view);
        return;
    }

    const createButton = event.target.closest("[data-create]");
    if (createButton) {
        openForm(createButton.dataset.create);
        return;
    }

    const editButton = event.target.closest("[data-edit]");
    if (editButton) {
        editRecord(editButton.dataset.edit, editButton.dataset.id);
        return;
    }

    const deleteButton = event.target.closest("[data-delete]");
    if (deleteButton) {
        deleteRecord(deleteButton.dataset.delete, deleteButton.dataset.id);
    }
});

$("global-add").addEventListener("click", () => {
    const typeByView = {
        dashboard: "project",
        projects: "project",
        tasks: "task",
        milestones: "milestone",
        team: "user"
    };
    openForm(typeByView[state.currentView] || "project");
});

$("record-form").addEventListener("submit", saveRecord);
$("close-dialog").addEventListener("click", closeForm);
$("cancel-dialog").addEventListener("click", closeForm);

async function loadApplication() {
    await refreshData();
}

navigate("dashboard");
loadApplication();
/**
 * TasksPanel.ts
 * 
 * Responsible for Google Tasks UI:
 * - Task list management (create, delete, select)
 * - Task CRUD operations
 * - Task rendering and status updates
 * 
 * SDD Principle: Single Responsibility - only handles tasks concerns
 */

import { Notice, App } from "obsidian";
import type ObsidianCalendarAgentPlugin from "./main";
import { GoogleTask, GoogleTaskList } from "./types";
import { PromptModal } from "./PromptModal";

/**
 * TasksPanel manages the Google Tasks interface
 */
export class TasksPanel {
    private plugin: ObsidianCalendarAgentPlugin;
    private app: App;

    // Tasks state
    private taskLists: GoogleTaskList[] = [];
    private tasks: GoogleTask[] = [];
    private selectedTaskListId: string = "@default";

    // UI Elements
    private tasksPanelEl!: HTMLDivElement;
    private tasksListEl!: HTMLDivElement;

    constructor(plugin: ObsidianCalendarAgentPlugin, app: App) {
        this.plugin = plugin;
        this.app = app;
    }

    /**
     * Initialize tasks panel with DOM element
     */
    public init(parentEl: HTMLDivElement): void {
        this.tasksPanelEl = parentEl;
        this.render();
    }

    /**
     * Render the entire tasks panel
     */
    private render(): void {
        this.tasksPanelEl.empty();
        this.tasksPanelEl.addClass("oca-tab-content");

        const wrap = this.tasksPanelEl.createDiv({ cls: "oca-tasks-container" });
        wrap.createEl("h4", { text: "Google Tasks" });

        // Controls bar
        this.renderControls(wrap);

        // Tasks list container
        this.tasksListEl = wrap.createDiv({ cls: "oca-tasks-list" });

        // Initial load
        this.reloadTasks();
    }

    /**
     * Render control buttons (task list select, add/delete buttons)
     */
    private renderControls(wrap: HTMLElement): void {
        const controls = wrap.createDiv({ cls: "oca-tasks-controls" });

        // Task List selection dropdown
        const listSelect = controls.createEl("select", {
            cls: "oca-tasks-select"
        });
        listSelect.addEventListener("change", async (e) => {
            const selectElement = e.target as HTMLSelectElement;
            this.selectedTaskListId = selectElement.value;
            await this.reloadTasks();
        });
        this.renderTaskListOptions(listSelect);

        // Refresh button
        const refreshBtn = controls.createEl("button", {
            text: "↻",
            cls: "oca-nav-btn"
        });
        refreshBtn.addEventListener("click", () => this.reloadTasks());
        refreshBtn.title = "Làm tươi danh sách công việc";

        // Add Task List button
        const addListBtn = controls.createEl("button", {
            text: "+ List",
            cls: "oca-nav-btn"
        });
        addListBtn.addEventListener("click", async () => {
            await this.handleCreateTaskList();
        });
        addListBtn.title = "Tạo danh sách công việc mới";

        // Add Task button
        const addTaskBtn = controls.createEl("button", {
            text: "+ Task",
            cls: "oca-nav-btn"
        });
        addTaskBtn.addEventListener("click", async () => {
            await this.handleCreateTask();
        });
        addTaskBtn.title = "Thêm công việc mới";

        // Delete Task List button
        const deleteListBtn = controls.createEl("button", {
            text: "🗑️",
            cls: "oca-nav-btn oca-nav-btn-danger"
        });
        deleteListBtn.addEventListener("click", async () => {
            await this.handleDeleteTaskList();
        });
        deleteListBtn.title = "Xóa danh sách công việc hiện tại";
    }

    /**
     * Handle creating a new task list
     */
    private async handleCreateTaskList(): Promise<void> {
        const title = await new PromptModal(
            this.app,
            "Nhập tên danh sách công việc mới:"
        ).openAndGetValue();

        if (!title) return;

        try {
            await this.plugin.googleTasksApi.createTaskList(title);
            await this.reloadTasks();
            new Notice(`Đã tạo danh sách công việc: "${title}"`);
        } catch (error) {
            console.error("[TasksPanel] Failed to create task list:", error);
            new Notice(
                `Lỗi tạo danh sách: ${(error as Error).message}`
            );
        }
    }

    /**
     * Handle creating a new task
     */
    private async handleCreateTask(): Promise<void> {
        if (!this.selectedTaskListId) {
            new Notice("Vui lòng chọn danh sách công việc trước.");
            return;
        }

        const title = await new PromptModal(
            this.app,
            "Nhập tiêu đề công việc mới:"
        ).openAndGetValue();

        if (!title) return;

        try {
            await this.plugin.googleTasksApi.createTask(
                this.selectedTaskListId,
                { title }
            );
            await this.reloadTasks();
            new Notice(`Đã thêm công việc: "${title}"`);
        } catch (error) {
            console.error("[TasksPanel] Failed to create task:", error);
            new Notice(`Lỗi thêm công việc: ${(error as Error).message}`);
        }
    }

    /**
     * Handle deleting a task list
     */
    private async handleDeleteTaskList(): Promise<void> {
        if (
            !this.selectedTaskListId ||
            this.selectedTaskListId === "@default"
        ) {
            new Notice(
                "Không thể xóa danh sách mặc định hoặc danh sách chưa chọn."
            );
            return;
        }

        const listTitle =
            this.taskLists.find(
                list => list.id === this.selectedTaskListId
            )?.title || this.selectedTaskListId;

        if (
            !confirm(
                `Bạn có chắc chắn muốn xóa danh sách công việc "${listTitle}" không?`
            )
        ) {
            return;
        }

        try {
            await this.plugin.googleTasksApi.deleteTaskList(
                this.selectedTaskListId
            );
            this.selectedTaskListId = "@default";
            await this.reloadTasks();
            new Notice(`Đã xóa danh sách công việc: "${listTitle}"`);
        } catch (error) {
            console.error("[TasksPanel] Failed to delete task list:", error);
            new Notice(
                `Lỗi xóa danh sách: ${(error as Error).message}`
            );
        }
    }

    /**
     * Render task list options in dropdown
     */
    private renderTaskListOptions(selectElement: HTMLSelectElement): void {
        selectElement.empty();

        for (const list of this.taskLists) {
            const option = selectElement.createEl("option", {
                value: list.id,
                text: list.title
            });
            if (list.id === this.selectedTaskListId) {
                option.selected = true;
            }
        }
    }

    /**
     * Reload tasks from Google Tasks API
     */
    private async reloadTasks(): Promise<void> {
        try {
            // Load task lists
            this.taskLists = await this.plugin.googleTasksApi.listTaskLists({});

            // Validate selected task list
            if (
                !this.taskLists.some(
                    list => list.id === this.selectedTaskListId
                )
            ) {
                this.selectedTaskListId =
                    this.taskLists.length > 0
                        ? this.taskLists[0].id
                        : "@default";
            }

            // Load tasks for selected list
            this.tasks = await this.plugin.googleTasksApi.listTasks({
                tasklist: this.selectedTaskListId
            });

            // Render tasks
            this.renderTasksList();

            // Update select element
            const listSelect = this.tasksPanelEl.querySelector(
                ".oca-tasks-select"
            ) as HTMLSelectElement;
            if (listSelect) {
                this.renderTaskListOptions(listSelect);
            }
        } catch (error) {
            console.error("[TasksPanel] reloadTasks failed", error);
            new Notice(`Lỗi tải tasks: ${(error as Error).message}`);
        }
    }

    /**
     * Render all tasks in the current list
     */
    private renderTasksList(): void {
        this.tasksListEl.empty();

        if (this.tasks.length === 0) {
            const emptyEl = this.tasksListEl.createDiv({
                cls: "oca-tasks-empty"
            });
            emptyEl.setText("Không có công việc nào.");
            return;
        }

        for (const task of this.tasks) {
            this.renderTaskItem(task);
        }
    }

    /**
     * Render a single task item
     */
    private renderTaskItem(task: GoogleTask): void {
        const taskEl = this.tasksListEl.createDiv({ cls: "oca-task-item" });

        // Checkbox for completion status
        const checkbox = taskEl.createEl("input", {
            type: "checkbox",
            cls: "oca-task-checkbox"
        });
        checkbox.checked = task.status === "completed";
        checkbox.addEventListener("change", async () => {
            await this.handleTaskStatusChange(task, checkbox);
        });

        // Task content
        const contentEl = taskEl.createDiv({ cls: "oca-task-content" });
        contentEl.createSpan({ text: task.title || "Untitled" });

        if (task.notes) {
            contentEl.createEl("p", {
                cls: "oca-task-notes",
                text: task.notes
            });
        }

        if (task.due) {
            contentEl.createSpan({
                cls: "oca-task-due",
                text: ` - Hạn chót: ${new Date(task.due).toLocaleDateString()}`
            });
        }

        // Edit button
        const editBtn = taskEl.createEl("button", {
            text: "✏️",
            cls: "oca-task-action-btn"
        });
        editBtn.addEventListener("click", async () => {
            await this.handleEditTask(task);
        });
        editBtn.title = "Chỉnh sửa công việc";

        // Delete button
        const deleteBtn = taskEl.createEl("button", {
            text: "🗑️",
            cls: "oca-task-action-btn oca-task-action-btn-danger"
        });
        deleteBtn.addEventListener("click", async () => {
            await this.handleDeleteTask(task);
        });
        deleteBtn.title = "Xóa công việc";
    }

    /**
     * Handle task status change (completion)
     */
    private async handleTaskStatusChange(
        task: GoogleTask,
        checkbox: HTMLInputElement
    ): Promise<void> {
        try {
            const newStatus = checkbox.checked ? "completed" : "needsAction";
            await this.plugin.googleTasksApi.patchTask(
                this.selectedTaskListId,
                task.id!,
                { status: newStatus }
            );

            task.status = newStatus;
            new Notice(
                `Đã cập nhật trạng thái công việc: "${task.title}"`
            );
            this.renderTasksList();
        } catch (error) {
            console.error(
                `[TasksPanel] Failed to update task ${task.id}:`,
                error
            );
            new Notice(
                `Lỗi cập nhật trạng thái: ${(error as Error).message}`
            );
            checkbox.checked = !checkbox.checked;
        }
    }

    /**
     * Handle editing a task
     */
    private async handleEditTask(task: GoogleTask): Promise<void> {
        const newTitle = await new PromptModal(
            this.app,
            "Chỉnh sửa tiêu đề công việc:",
            task.title || ""
        ).openAndGetValue();

        if (newTitle === null) return;

        const newNotes = await new PromptModal(
            this.app,
            "Chỉnh sửa ghi chú công việc:",
            task.notes || ""
        ).openAndGetValue();

        if (newNotes === null) return;

        const dueDateStr = task.due
            ? new Date(task.due).toISOString().split("T")[0]
            : "";
        const newDueStr = await new PromptModal(
            this.app,
            "Nhập hạn chót (YYYY-MM-DD) hoặc để trống:",
            dueDateStr
        ).openAndGetValue();

        if (newDueStr === null) return;

        // Validate date format
        const dueDate = newDueStr
            ? new Date(newDueStr)
            : undefined;

        if (newDueStr && dueDate && isNaN(dueDate.getTime())) {
            new Notice(
                "Định dạng ngày không hợp lệ. Vui lòng sử dụng YYYY-MM-DD."
            );
            return;
        }

        const formattedDueDate =
            dueDate instanceof Date && !isNaN(dueDate.getTime())
                ? dueDate.toISOString()
                : undefined;

        try {
            await this.plugin.googleTasksApi.updateTask(
                this.selectedTaskListId,
                task.id!,
                {
                    title: newTitle,
                    notes: newNotes || undefined,
                    due: formattedDueDate
                }
            );

            await this.reloadTasks();
            new Notice(`Đã cập nhật công việc: "${task.title}"`);
        } catch (error) {
            console.error(
                `[TasksPanel] Failed to update task ${task.id}:`,
                error
            );
            new Notice(
                `Lỗi cập nhật công việc: ${(error as Error).message}`
            );
        }
    }

    /**
     * Handle deleting a task
     */
    private async handleDeleteTask(task: GoogleTask): Promise<void> {
        if (
            !confirm(
                `Bạn có chắc chắn muốn xóa công việc "${task.title}" không?`
            )
        ) {
            return;
        }

        try {
            await this.plugin.googleTasksApi.deleteTask(
                this.selectedTaskListId,
                task.id!
            );

            await this.reloadTasks();
            new Notice(`Đã xóa công việc: "${task.title}"`);
        } catch (error) {
            console.error(
                `[TasksPanel] Failed to delete task ${task.id}:`,
                error
            );
            new Notice(
                `Lỗi xóa công việc: ${(error as Error).message}`
            );
        }
    }

    /**
     * Get selected task list ID
     */
    getSelectedTaskListId(): string {
        return this.selectedTaskListId;
    }

    /**
     * Get all task lists
     */
    getTaskLists(): GoogleTaskList[] {
        return this.taskLists;
    }

    /**
     * Get all tasks in current list
     */
    getTasks(): GoogleTask[] {
        return this.tasks;
    }
}

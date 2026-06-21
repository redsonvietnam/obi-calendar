/**
 * MessageRenderer.ts
 * 
 * Responsible for rendering chat messages in the UI:
 * - Standard User/Assistant message bubbles
 * - Complex AI Proposal messages with collapsible content and edit/save actions
 * - Tool trace messages
 * 
 * SDD Principle: Single Responsibility - only rendering logic
 */

import { Notice, App } from "obsidian";
import { MarkdownRenderer } from "obsidian";
import { ChatMessage } from "./types";

export interface MessageRendererOptions {
    app: App;
    plugin: any; // ObsidianCalendarAgentPlugin
    pendingProposalFile: string | null;
    onSaveProposal: (content: string, filePath: string) => Promise<void>;
    onCancelProposal: () => void;
    onPushMessage: (role: ChatMessage["role"], content: string) => void;
    onScrollToBottom: () => void;
}

/**
 * MessageRenderer handles the visual representation of chat messages
 */
export class MessageRenderer {
    private options: MessageRendererOptions;

    constructor(options: MessageRendererOptions) {
        this.options = options;
    }

    /**
     * Render a single message into the provided element
     */
    public async renderMessage(
        container: HTMLDivElement,
        msg: ChatMessage
    ): Promise<void> {
        const row = container.createDiv({ cls: `oca-msg oca-msg-${msg.role}` });
        const meta = row.createDiv({ cls: "oca-msg-meta" });

        const roleLabel =
            msg.role === "assistant"
                ? "AI"
                : msg.role === "user"
                    ? "Bạn"
                    : msg.role.toUpperCase();

        meta.setText(
            `${roleLabel} • ${new Date(msg.createdAt).toLocaleTimeString("vi-VN")}`
        );

        if (msg.role === "proposal") {
            this.renderProposalMessage(row, msg);
        } else {
            const body = row.createDiv({ cls: "oca-msg-body" });
            await MarkdownRenderer.render(
                this.options.app,
                msg.content,
                body,
                '',
                this.options.plugin
            );
        }
    }

    /**
     * Render a complex AI proposal message with interactive elements
     */
    private renderProposalMessage(row: HTMLElement, msg: ChatMessage): void {
        row.classList.add("oca-msg-proposal");
        const body = row.createDiv({ cls: "oca-msg-body" });

        // Collapsible header bar
        const header = body.createDiv({ cls: "oca-proposal-header" });
        const toggleIcon = header.createSpan({ cls: "oca-proposal-toggle", text: "▼" });
        header.createSpan({ cls: "oca-proposal-title", text: "Đề xuất từ AI" });

        const preview = header.createSpan({ cls: "oca-proposal-preview" });
        const plainPreview = msg.content.replace(/\n+/g, " ").slice(0, 80);
        preview.setText(plainPreview + (msg.content.length > 80 ? "…" : ""));

        const actions = header.createDiv({ cls: "oca-proposal-header-actions" });
        const saveSmall = actions.createEl("button", {
            cls: "oca-pill oca-pill-primary",
            text: "Lưu"
        });
        const cancelSmall = actions.createEl("button", {
            cls: "oca-pill",
            text: "Hủy"
        });

        // Collapsible content
        const contentWrap = body.createDiv({ cls: "oca-proposal-content" });
        const innerWrap = contentWrap.createDiv({ cls: "oca-proposal-inner" });
        const textarea = innerWrap.createEl("textarea", {
            cls: "oca-proposal-textarea"
        });
        textarea.value = msg.content;

        const btnContainer = innerWrap.createDiv({ cls: "oca-proposal-buttons" });
        const saveBtn = btnContainer.createEl("button", {
            cls: "mod-cta oca-proposal-save",
            text: "Sắp xếp & Lưu"
        });
        const cancelBtn = btnContainer.createEl("button", {
            cls: "oca-proposal-cancel",
            text: "Hủy bỏ"
        });

        // Toggle expand/collapse
        const toggleExpand = () => {
            const isCollapsed = contentWrap.classList.contains("collapsed");
            contentWrap.classList.toggle("collapsed");
            toggleIcon.textContent = isCollapsed ? "▼" : "▶";
            if (!isCollapsed) {
                this.options.onScrollToBottom();
            }
        };

        header.addEventListener("click", (e) => {
            if (!(e.target as HTMLElement).closest("button")) toggleExpand();
        });
        toggleIcon.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleExpand();
        });

        // Save action
        const doSave = async () => {
            const editedContent = textarea.value;
            const filePath = this.options.pendingProposalFile;
            if (!filePath) return;
            try {
                await this.options.onSaveProposal(editedContent, filePath);
            } catch (error) {
                new Notice(`Lỗi khi lưu file: ${(error as Error).message}`);
            }
        };
        saveBtn.addEventListener("click", doSave);
        saveSmall.addEventListener("click", (e) => {
            e.stopPropagation();
            doSave();
        });

        // Cancel action
        const doCancel = () => {
            this.options.onCancelProposal();
        };
        cancelBtn.addEventListener("click", doCancel);
        cancelSmall.addEventListener("click", (e) => {
            e.stopPropagation();
            doCancel();
        });
    }
}

import { App, Modal, Setting } from "obsidian";

export class PromptModal extends Modal {
    private resolve!: (value: string | null) => void;
    private reject!: (reason?: any) => void;
    private input: string;
    private message: string;
    private initialValue: string;

    constructor(app: App, message: string, initialValue: string = "") {
        super(app);
        this.message = message;
        this.input = initialValue;
        this.initialValue = initialValue;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl("h2", { text: this.message });

        new Setting(contentEl)
            .setName("Input")
            .addText((text) =>
                text
                    .setPlaceholder(this.initialValue)
                    .setValue(this.initialValue)
                    .onChange((value) => {
                        this.input = value;
                    })
                    .inputEl.addEventListener("keydown", (e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            this.close();
                            this.resolve(this.input);
                        }
                    })
            );

        new Setting(contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText("Cancel")
                    .onClick(() => {
                        this.close();
                        this.resolve(null);
                    })
            )
            .addButton((btn) =>
                btn
                    .setButtonText("OK")
                    .setCta()
                    .onClick(() => {
                        this.close();
                        this.resolve(this.input);
                    })
            );
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
        // If the modal was closed without user interaction (e.g., clicking outside or pressing Esc without resolving),
        // we should resolve with null to indicate no input was provided, rather than rejecting.
        // The resolve(null) calls in the click handlers already cover explicit cancellations.
        // This check prevents an error if the modal is dismissed unexpectedly.
        if (!this.input && this.resolve) {
            this.resolve(null);
        }
    }

    openAndGetValue(): Promise<string | null> {
        return new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
            this.open();
        });
    }
}
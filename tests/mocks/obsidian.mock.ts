/**
 * Obsidian API Mock for Unit Testing
 * 
 * This mock provides a basic implementation of the Obsidian API to allow tests
 * to run in a Node.js environment without the actual Obsidian app.
 */

export class Notice {
    constructor(message: string) {
        console.log(`[Notice]: ${message}`);
    }
}


export class Modal {
    constructor(app: any) {}
    async openAndGetValue<T>(): Promise<T | null> { return null; }
    close() { }
}

export class Plugin {

    app!: any;
    settings: any = {};

    async loadData() { return {}; }
    async saveData(data: any) { return; }
    addSettingTab(tab: any) { }
    registerView(type: string, cb: any) { }
    addCommand(cmd: any) { }
    registerEvent(cb: any) { }
}

export class ItemView {
    contentEl = {
        empty: () => {},
        createDiv: (opts: any) => ({
            createDiv: (opts: any) => ({
                empty: () => {},
                createDiv: (opts: any) => ({}),
                createEl: (tag: string, opts: any) => ({
                    addEventListener: () => {},
                    setText: () => {},
                    addClass: () => {},
                    removeClass: () => {},
                    toggleClass: () => {},
                    style: {},
                    dataset: {}
                })
            }),
            createEl: (tag: string, opts: any) => ({
                addEventListener: () => {},
                setText: () => {},
                addClass: () => {},
                removeClass: () => {},
                toggleClass: () => {},
                style: {},
                dataset: {}
            })
        })
    };

    constructor(leaf: any) {}
}

export class WorkspaceLeaf {
    setViewState(state: any) { return Promise.resolve(); }
}

export const requestUrl = async (options: any) => {
    return {
        status: 200,
        json: {},
        text: "{}"
    };
};

export class MarkdownRenderer {
    static async render(app: any, content: string, container: any, source: any, options: any) {
        return Promise.resolve();
    }
}

export class Vault {
    async read(path: string) { return "mock content"; }
    async createFolder(path: string) { return; }
    async createBinary(path: string, data: any) { return; }
    getAbstractFileByPath(path: string) {
        return Promise.resolve({ path });
    }
    getFiles() { return []; }
}

export class App {
    vault = new Vault();
    workspace = {
        getActiveFile: () => null,
        getLeavesOfType: () => [],
        getRightLeaf: () => ({ setViewState: () => Promise.resolve() })
    };
}

export default App;

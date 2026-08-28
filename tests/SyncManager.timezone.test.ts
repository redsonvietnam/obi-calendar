/**
 * SyncManager.timezone.test.ts
 * WS3 – timezone / date-boundary regression tests
 */
import { SyncManager } from "../src/SyncManager";
import { GoogleTasksAPI } from "../src/GoogleTasksAPI";
import { GoogleCalendarAPI } from "../src/GoogleCalendarAPI";
import { DEFAULT_TIMEZONE } from "../src/types";

(global as any).window = {
    setInterval: jest.fn(() => 123),
    clearInterval: jest.fn(),
};

jest.mock("obsidian", () => ({
    Notice: jest.fn(),
    TFile: class TFile {
        path = "";
        basename = "";
        extension = "md";
        stat = { mtime: 0 };
    },
}));

jest.mock("../src/Logger", () => ({
    Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

function createManager(tz: string | undefined, dailyFolder = "Daily") {
    const plugin: any = {
        settings: {
            timezone: tz ?? DEFAULT_TIMEZONE,
            sync: { enabled: false, intervalMinutes: 5, syncTasks: false, syncCalendar: true },
            dailyNotesFolder: dailyFolder,
        },
        app: {
            vault: {
                getMarkdownFiles: jest.fn().mockReturnValue([]),
                getAbstractFileByPath: jest.fn().mockReturnValue(null),
                read: jest.fn().mockResolvedValue(""),
                modify: jest.fn().mockResolvedValue(undefined),
                create: jest.fn().mockResolvedValue({ path: "x", extension: "md" } as any),
                createFolder: jest.fn().mockResolvedValue(undefined),
                on: jest.fn(),
                off: jest.fn(),
            },
        },
    };
    const tasks = { listTaskLists: jest.fn(), listTasks: jest.fn() } as any;
    const cal = { listEvents: jest.fn().mockResolvedValue([]) } as any;
    const mgr = new SyncManager(plugin, tasks as any, cal as any);
    return { mgr, plugin, cal };
}

describe("SyncManager timezone correctness", () => {
    test("Test A – UTC previous-day boundary: 00:30 Asia/Ho_Chi_Minh belongs to next local day", () => {
        const { mgr } = createManager("Asia/Ho_Chi_Minh");
        // 2026-08-29 00:30 +07:00 = 2026-08-28T17:30:00Z
        const event = { start: { dateTime: "2026-08-28T17:30:00Z" } };
        const local = (mgr as any).getEventLocalDate(event);
        expect(local).toBe("2026-08-29");

        // Also with explicit +07 offset string
        const event2 = { start: { dateTime: "2026-08-29T00:30:00+07:00" } };
        expect((mgr as any).getEventLocalDate(event2)).toBe("2026-08-29");
    });

    test("Test B – normal daytime event remains on expected local date", () => {
        const { mgr } = createManager("Asia/Ho_Chi_Minh");
        const event = { start: { dateTime: "2026-08-29T10:00:00+07:00" } };
        expect((mgr as any).getEventLocalDate(event)).toBe("2026-08-29");
        const eventZ = { start: { dateTime: "2026-08-29T03:00:00Z" } }; // 10:00 +07
        expect((mgr as any).getEventLocalDate(eventZ)).toBe("2026-08-29");
    });

    test("Test C – all-day event start.date belongs to that date", () => {
        const { mgr } = createManager("Asia/Ho_Chi_Minh");
        const event = { start: { date: "2026-08-29" }, end: { date: "2026-08-30" } };
        expect((mgr as any).getEventLocalDate(event)).toBe("2026-08-29");
        // end is exclusive but start is canonical
        const event2 = { start: { date: "2026-12-31" } };
        expect((mgr as any).getEventLocalDate(event2)).toBe("2026-12-31");
    });

    test("Test D – timezone configuration changes date interpretation", () => {
        const { mgr: mgrVn } = createManager("Asia/Ho_Chi_Minh");
        const { mgr: mgrUtc } = createManager("UTC");
        const instant = "2026-08-28T17:30:00Z"; // 00:30 VN next day
        const e = { start: { dateTime: instant } };
        expect((mgrVn as any).getEventLocalDate(e)).toBe("2026-08-29");
        expect((mgrUtc as any).getEventLocalDate(e)).toBe("2026-08-28");

        // Verify manager uses configured timezone, not hard-coded
        const src = require("fs").readFileSync("src/SyncManager.ts", "utf8");
        expect(src).not.toMatch(/\"Asia\/Ho_Chi_Minh\"/); // no hard-code in sync logic
        expect(src).toMatch(/DEFAULT_TIMEZONE/);
        expect(src).toMatch(/getTimezone/);
    });

    test("Test D – syncCalendar daily note path uses configured timezone", async () => {
        // Mock today as 2026-08-29 00:30 Asia/Ho_Chi_Minh which is 2026-08-28 17:30Z
        const fixed = new Date("2026-08-28T17:30:00Z");
        const realDate = global.Date;
        // @ts-ignore
        global.Date = class extends realDate {
            constructor(...args: any[]) {
                // @ts-ignore
                if (args.length === 0) return new realDate(fixed);
                // @ts-ignore
                return new realDate(...args);
            }
            static now() { return fixed.getTime(); }
            static UTC = realDate.UTC;
            static parse = realDate.parse;
        } as any;

        const { mgr, plugin, cal } = createManager("Asia/Ho_Chi_Minh", "Daily");
        const mockFile = { path: "Daily/2026-08-29.md", basename: "2026-08-29", extension: "md", stat: { mtime: 0 } };
        // Simulate file not found then created, with read returning empty
        plugin.app.vault.getAbstractFileByPath.mockImplementation((p: string) => (p === "Daily/2026-08-29.md" ? null : null));
        // First create will succeed
        const created = { path: "Daily/2026-08-29.md", extension: "md" } as any;
        plugin.app.vault.create.mockResolvedValue(created);
        // After creation, second getAbstractFileByPath during same syncCalendar after creation is not re-checked; file is the created one
        // But our private syncCalendar will use the created file variable directly, so read should be for created file
        plugin.app.vault.read.mockResolvedValue("");
        cal.listEvents.mockResolvedValue([]);
        // Call private syncCalendar via any
        await (mgr as any).syncCalendar();

        // Should have requested events for local day 2026-08-29 window, not UTC 2026-08-28
        expect(cal.listEvents).toHaveBeenCalled();
        const args = cal.listEvents.mock.calls[0][0];
        // timeMin should be 2026-08-28T17:00:00.000Z (midnight Ho_Chi_Minh)
        expect(args.timeMin).toBe("2026-08-28T17:00:00.000Z");
        expect(args.timeMax).toBe("2026-08-29T17:00:00.000Z");
        // dailyNotePath derived via getLocalTodayString should be 2026-08-29
        expect(plugin.app.vault.create).toHaveBeenCalledWith("Daily/2026-08-29.md", expect.any(String));

        global.Date = realDate;
    });

    test("Test E – existing SyncManager tests still green (smoke)", async () => {
        const { mgr, plugin, cal } = createManager("Asia/Ho_Chi_Minh");
        plugin.app.vault.getAbstractFileByPath.mockReturnValue({ path: "Daily/2026-08-29.md", extension: "md" } as any);
        plugin.app.vault.read.mockResolvedValue("hello");
        cal.listEvents.mockResolvedValue([
            { summary: "M", start: { dateTime: "2026-08-29T10:00:00+07:00" }, end: { dateTime: "2026-08-29T11:00:00+07:00" } } as any,
        ]);
        const res = await (mgr as any).syncCalendar();
        expect(res).toBe(1);
    });

    test("timed event with explicit event timeZone is respected via instant", () => {
        const { mgr } = createManager("Asia/Ho_Chi_Minh");
        // Google returns dateTime with Z but timeZone field indicates original zone; we still interpret instant correctly
        const e = { start: { dateTime: "2026-08-29T00:30:00+07:00", timeZone: "Asia/Ho_Chi_Minh" } };
        expect((mgr as any).getEventLocalDate(e)).toBe("2026-08-29");
        // All-day should not be converted via UTC
        const all = { start: { date: "2026-08-29", timeZone: "Asia/Ho_Chi_Minh" } };
        expect((mgr as any).getEventLocalDate(all)).toBe("2026-08-29");
    });
});

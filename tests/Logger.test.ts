import { Logger, LogLevel } from "../src/Logger";

describe("Logger", () => {
    let consoleDebugSpy: jest.SpyInstance;
    let consoleInfoSpy: jest.SpyInstance;
    let consoleWarnSpy: jest.SpyInstance;
    let consoleErrorSpy: jest.SpyInstance;

    beforeEach(() => {
        consoleDebugSpy = jest.spyOn(console, "debug").mockImplementation();
        consoleInfoSpy = jest.spyOn(console, "info").mockImplementation();
        consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation();
        consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe("log", () => {
        test("should call console.debug for DEBUG level", () => {
            Logger.log(LogLevel.DEBUG, "TestContext", "debug message", { key: "value" });
            expect(consoleDebugSpy).toHaveBeenCalledWith(
                expect.stringContaining("[Obsidian Calendar Agent]"),
                { key: "value" }
            );
            expect(consoleDebugSpy).toHaveBeenCalledWith(
                expect.stringContaining("DEBUG"),
                expect.anything()
            );
            expect(consoleDebugSpy).toHaveBeenCalledWith(
                expect.stringContaining("[TestContext]"),
                expect.anything()
            );
        });

        test("should call console.info for INFO level", () => {
            Logger.log(LogLevel.INFO, "TestContext", "info message");
            expect(consoleInfoSpy).toHaveBeenCalledWith(
                expect.stringContaining("[Obsidian Calendar Agent]"),
                ""
            );
            expect(consoleInfoSpy).toHaveBeenCalledWith(
                expect.stringContaining("INFO"),
                expect.anything()
            );
        });

        test("should call console.warn for WARN level", () => {
            Logger.log(LogLevel.WARN, "TestContext", "warn message");
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                expect.stringContaining("[Obsidian Calendar Agent]"),
                ""
            );
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                expect.stringContaining("WARN"),
                expect.anything()
            );
        });

        test("should call console.error for ERROR level", () => {
            Logger.log(LogLevel.ERROR, "TestContext", "error message", { err: "details" });
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining("[Obsidian Calendar Agent]"),
                { err: "details" }
            );
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining("ERROR"),
                expect.anything()
            );
        });

        test("should include timestamp in log message", () => {
            Logger.log(LogLevel.INFO, "Ctx", "msg");
            const loggedMessage = consoleInfoSpy.mock.calls[0][0];
            // Timestamp format: 2026-06-21T...
            expect(loggedMessage).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
        });
    });

    describe("convenience methods", () => {
        test("debug should call log with DEBUG", () => {
            Logger.debug("Ctx", "debug msg");
            expect(consoleDebugSpy).toHaveBeenCalled();
        });

        test("info should call log with INFO", () => {
            Logger.info("Ctx", "info msg");
            expect(consoleInfoSpy).toHaveBeenCalled();
        });

        test("warn should call log with WARN", () => {
            Logger.warn("Ctx", "warn msg");
            expect(consoleWarnSpy).toHaveBeenCalled();
        });

        test("error should call log with ERROR", () => {
            Logger.error("Ctx", "error msg");
            expect(consoleErrorSpy).toHaveBeenCalled();
        });
    });
});

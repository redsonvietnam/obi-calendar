/**
 * Logger.ts
 * 
 * Provides structured logging for the Calendar Agent.
 * Supports different log levels and context-aware logging.
 */

export enum LogLevel {
    DEBUG = "DEBUG",
    INFO = "INFO",
    WARN = "WARN",
    ERROR = "ERROR"
}

interface LogEntry {
    timestamp: string;
    level: LogLevel;
    context: string;
    message: string;
    data?: any;
}

export class Logger {
    private static readonly LOG_PREFIX = "[Obsidian Calendar Agent]";

    /**
     * Main logging method
     */
    static log(level: LogLevel, context: string, message: string, data?: any): void {
        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level,
            context,
            message,
            data
        };

        const formattedMessage = `${entry.timestamp} ${entry.level} [${entry.context}] ${entry.message}`;
        
        switch (level) {
            case LogLevel.DEBUG:
                console.debug(`${this.LOG_PREFIX} ${formattedMessage}`, data ?? "");
                break;
            case LogLevel.INFO:
                console.info(`${this.LOG_PREFIX} ${formattedMessage}`, data ?? "");
                break;
            case LogLevel.WARN:
                console.warn(`${this.LOG_PREFIX} ${formattedMessage}`, data ?? "");
                break;
            case LogLevel.ERROR:
                console.error(`${this.LOG_PREFIX} ${formattedMessage}`, data ?? "");
                break;
        }
    }

    static debug(context: string, message: string, data?: any) {
        this.log(LogLevel.DEBUG, context, message, data);
    }

    static info(context: string, message: string, data?: any) {
        this.log(LogLevel.INFO, context, message, data);
    }

    static warn(context: string, message: string, data?: any) {
        this.log(LogLevel.WARN, context, message, data);
    }

    static error(context: string, message: string, data?: any) {
        this.log(LogLevel.ERROR, context, message, data);
    }
}

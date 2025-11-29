import { App, TFile } from "obsidian";

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

// Interface for logger (real or no-op)
export interface ILogger {
  setDevMode(devMode: boolean): void;
  setApp(app: App): void;
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, error?: unknown): void;
  time(label: string): void;
  timeEnd(label: string): void;
  group(title: string): void;
  groupEnd(): void;
  table(data: unknown, title?: string): void;
  logPluginLoad(): void;
  logPluginUnload(): void;
  logCommandExecution(commandId: string): void;
  logSettingsChange(
    setting: string,
    oldValue: unknown,
    newValue: unknown,
  ): void;
  setLogLevel(logLevel: LogLevel): void;
}

const LOG_FILE = "substack-publisher.log";
const MAX_LOG_SIZE = 100000; // 100k chars, truncate if larger

// No-op logger that does nothing
class NoOpLogger implements ILogger {
  setDevMode(_devMode: boolean): void {
    /* no-op */
  }
  setApp(_app: App): void {
    /* no-op */
  }
  debug(_message: string, ..._args: unknown[]): void {
    /* no-op */
  }
  info(_message: string, ..._args: unknown[]): void {
    /* no-op */
  }
  warn(_message: string, ..._args: unknown[]): void {
    /* no-op */
  }
  error(_message: string, _error?: unknown): void {
    /* no-op */
  }
  time(_label: string): void {
    /* no-op */
  }
  timeEnd(_label: string): void {
    /* no-op */
  }
  group(_title: string): void {
    /* no-op */
  }
  groupEnd(): void {
    /* no-op */
  }
  table(_data: unknown, _title?: string): void {
    /* no-op */
  }
  logPluginLoad(): void {
    /* no-op */
  }
  logPluginUnload(): void {
    /* no-op */
  }
  logCommandExecution(_commandId: string): void {
    /* no-op */
  }
  logSettingsChange(
    _setting: string,
    _oldValue: unknown,
    _newValue: unknown
  ): void {
    /* no-op */
  }
  setLogLevel(_logLevel: LogLevel): void {
    /* no-op */
  }
}

export class Logger implements ILogger {
  private name: string;
  private devMode: boolean;
  private logLevel: LogLevel;
  private app: App | null = null;
  private logBuffer: string[] = [];
  private flushTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    name: string,
    devMode: boolean = false,
    logLevel: LogLevel = LogLevel.INFO
  ) {
    this.name = name;
    this.devMode = devMode;
    this.logLevel = logLevel;
  }

  setApp(app: App): void {
    this.app = app;
  }

  setDevMode(devMode: boolean): void {
    this.devMode = devMode;
  }

  setLogLevel(logLevel: LogLevel): void {
    this.logLevel = logLevel;
  }

  private formatMessage(level: string, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${this.name}] [${level}] ${message}`;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.logLevel;
  }

  private writeToFile(formattedMessage: string, data?: unknown): void {
    if (!this.app) return;

    let logLine = formattedMessage;
    if (data !== undefined) {
      try {
        logLine += ` ${JSON.stringify(data, null, 0)}`;
      } catch {
        logLine += " [unserializable data]";
      }
    }
    logLine += "\n";

    this.logBuffer.push(logLine);

    // Debounce writes
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
    }
    this.flushTimeout = setTimeout(() => {
      void this.flushLogs();
    }, 500);
  }

  private async flushLogs(): Promise<void> {
    if (!this.app || this.logBuffer.length === 0) return;

    const logsToWrite = this.logBuffer.join("");
    this.logBuffer = [];

    try {
      const vault = this.app.vault;
      const logFile = vault.getAbstractFileByPath(LOG_FILE);

      if (logFile instanceof TFile) {
        let content = await vault.read(logFile);

        // Truncate if too large (keep last half)
        if (content.length > MAX_LOG_SIZE) {
          const lines = content.split("\n");
          content = lines.slice(Math.floor(lines.length / 2)).join("\n");
          content = `[... truncated ...]\n${content}`;
        }

        await vault.modify(logFile, content + logsToWrite);
      } else {
        await vault.create(LOG_FILE, logsToWrite);
      }
    } catch {
      // Silently fail - we can't log errors about logging
    }
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      const formatted = this.formatMessage("DEBUG", message);
      this.writeToFile(formatted, args.length > 0 ? args : undefined);
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.INFO)) {
      const formatted = this.formatMessage("INFO", message);
      this.writeToFile(formatted, args.length > 0 ? args : undefined);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.WARN)) {
      const formatted = this.formatMessage("WARN", message);
      this.writeToFile(formatted, args.length > 0 ? args : undefined);
    }
  }

  error(message: string, error?: unknown): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const formatted = this.formatMessage("ERROR", message);
      if (error) {
        // Serialize error for file
        let errorData: unknown;
        if (error instanceof Error) {
          errorData = {
            message: error.message,
            stack: error.stack,
            name: error.name
          };
        } else {
          errorData = error;
        }
        this.writeToFile(formatted, errorData);
      } else {
        this.writeToFile(formatted);
      }
    }
  }

  // Performance timing utilities - write to file only
  time(_label: string): void {
    if (this.devMode) {
      this.debug(`Timer start: ${_label}`);
    }
  }

  timeEnd(label: string): void {
    if (this.devMode) {
      this.debug(`Timer end: ${label}`);
    }
  }

  // Log grouping for organizing related logs
  group(title: string): void {
    if (this.devMode) {
      this.debug(`--- ${title} ---`);
    }
  }

  groupEnd(): void {
    if (this.devMode) {
      this.debug("--- end ---");
    }
  }

  // Table logging for structured data
  table(data: unknown, title?: string): void {
    if (this.devMode) {
      if (title) {
        this.debug(title);
      }
      this.debug("Table data", data);
    }
  }

  // Lifecycle logging helpers
  logPluginLoad(): void {
    this.info("Plugin loaded successfully");
  }

  logPluginUnload(): void {
    this.info("Plugin unloaded");
    // Force flush on unload
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
    }
    void this.flushLogs();
  }

  logCommandExecution(commandId: string): void {
    this.debug(`Executing command: ${commandId}`);
  }

  logSettingsChange(
    setting: string,
    oldValue: unknown,
    newValue: unknown
  ): void {
    this.debug(`Setting changed: ${setting}`, { from: oldValue, to: newValue });
  }
}

// Factory function to create either real logger or no-op logger
export function createLogger(
  name: string,
  devMode: boolean = false,
  logLevel: LogLevel = LogLevel.ERROR
): ILogger {
  return devMode ? new Logger(name, devMode, logLevel) : new NoOpLogger();
}

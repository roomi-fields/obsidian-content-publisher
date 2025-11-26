import { App, TFile } from "obsidian";

export enum LogLevel {
	DEBUG = 0,
	INFO = 1,
	WARN = 2,
	ERROR = 3
}

const LOG_FILE = "substack-publisher.log";
const MAX_LOG_SIZE = 100000; // ~100KB, truncate if larger

// No-op logger that does nothing
class NoOpLogger {
  setDevMode(_devMode: boolean): void {}
  setApp(_app: App): void {}
  debug(_message: string, ..._args: unknown[]): void {}
  info(_message: string, ..._args: unknown[]): void {}
  warn(_message: string, ..._args: unknown[]): void {}
  error(_message: string, _error?: unknown): void {}
  time(_label: string): void {}
  timeEnd(_label: string): void {}
  group(_title: string): void {}
  groupEnd(): void {}
  table(_data: unknown, _title?: string): void {}
  logPluginLoad(): void {}
  logPluginUnload(): void {}
  logCommandExecution(_commandId: string): void {}
  logSettingsChange(_setting: string, _oldValue: unknown, _newValue: unknown): void {}
  setLogLevel(_logLevel: LogLevel): void {}
}

export class Logger {
  private name: string;
  private devMode: boolean;
  private logLevel: LogLevel;
  private app: App | null = null;
  private logBuffer: string[] = [];
  private flushTimeout: NodeJS.Timeout | null = null;

  constructor(name: string, devMode: boolean = false, logLevel: LogLevel = LogLevel.INFO) {
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

  private async writeToFile(formattedMessage: string, data?: unknown): Promise<void> {
    if (!this.app) return;

    let logLine = formattedMessage;
    if (data !== undefined) {
      try {
        logLine += ` ${  JSON.stringify(data, null, 0)}`;
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
    this.flushTimeout = setTimeout(() => this.flushLogs(), 500);
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
          content = `[... truncated ...]\n${  content}`;
        }

        await vault.modify(logFile, content + logsToWrite);
      } else {
        await vault.create(LOG_FILE, logsToWrite);
      }
    } catch (e) {
      // Fallback to console if file write fails
      console.error("Failed to write to log file:", e); // eslint-disable-line no-console -- Fallback logging when file write fails
    }
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      const formatted = this.formatMessage("DEBUG", message);
      console.log(formatted, ...args); // eslint-disable-line no-console -- Logger output method
      this.writeToFile(formatted, args.length > 0 ? args : undefined);
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.INFO)) {
      const formatted = this.formatMessage("INFO", message);
      console.info(formatted, ...args);  // eslint-disable-line no-console -- Logger output method
      this.writeToFile(formatted, args.length > 0 ? args : undefined);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.WARN)) {
      const formatted = this.formatMessage("WARN", message);
      console.warn(formatted, ...args);  // eslint-disable-line no-console -- Logger output method
      this.writeToFile(formatted, args.length > 0 ? args : undefined);
    }
  }

  error(message: string, error?: unknown): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const formatted = this.formatMessage("ERROR", message);
      if (error) {
        console.error(formatted, error);  // eslint-disable-line no-console -- Logger output method
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
        console.error(formatted);  // eslint-disable-line no-console -- Logger output method
        this.writeToFile(formatted);
      }
    }
  }

  // Performance timing utilities
  time(foo: string): void {
    if (this.devMode) {
      console.time(this.formatMessage("TIMER", `${foo} - start`));  // eslint-disable-line no-console -- Logger timing method
    }
  }

  timeEnd(label: string): void {
    if (this.devMode) {
      console.timeEnd(this.formatMessage("TIMER", `${label} - start`)); // eslint-disable-line no-console -- Logger timing method
    }
  }

  // Log grouping for organizing related logs
  group(title: string): void {
    if (this.devMode) {
      console.group(this.formatMessage("GROUP", title)); // eslint-disable-line no-console -- Logger grouping method
    }
  }

  groupEnd(): void {
    if (this.devMode) {
      console.groupEnd(); // eslint-disable-line no-console -- Logger grouping method
    }
  }

  // Table logging for structured data
  table(data: unknown, title?: string): void {
    if (this.devMode) {
      if (title) {
        this.debug(title);
      }
      console.table(data); // eslint-disable-line no-console -- Logger table output method
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
    this.flushLogs();
  }

  logCommandExecution(commandId: string): void {
    this.debug(`Executing command: ${commandId}`);
  }

  logSettingsChange(setting: string, oldValue: unknown, newValue: unknown): void {
    this.debug(`Setting changed: ${setting}`, { from: oldValue, to: newValue });
  }
}

// Factory function to create either real logger or no-op logger
export function createLogger(name: string, devMode: boolean = false, logLevel: LogLevel = LogLevel.ERROR): Logger | NoOpLogger {
  return devMode ? new Logger(name, devMode, logLevel) : new NoOpLogger();
}

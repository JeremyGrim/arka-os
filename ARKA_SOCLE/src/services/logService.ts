import { promises as fs } from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';
import { LogEntry } from '../types';

type LogLevel = LogEntry['level'];

export class LogService {
  private readonly logs: LogEntry[] = [];
  private readonly subscribers: Array<(entry: LogEntry) => void> = [];

  constructor(private readonly storageDir: string) {}

  async init(): Promise<void> {
    await fs.mkdir(this.storageDir, { recursive: true });
    const logsPath = this.getLogPath();
    try {
      const raw = await fs.readFile(logsPath, 'utf-8');
      const parsed = JSON.parse(raw) as LogEntry[];
      parsed.forEach((entry) => this.logs.push(entry));
    } catch {
      await this.persist();
    }
  }

  debug(message: string, source = 'socle', sessionId?: string): void {
    this.append('debug', message, source, sessionId);
  }

  info(message: string, source = 'socle', sessionId?: string): void {
    this.append('info', message, source, sessionId);
  }

  warn(message: string, source = 'socle', sessionId?: string): void {
    this.append('warn', message, source, sessionId);
  }

  error(message: string, source = 'socle', sessionId?: string): void {
    this.append('error', message, source, sessionId);
  }

  onLog(listener: (entry: LogEntry) => void): void {
    this.subscribers.push(listener);
  }

  getLogs(limit = 50, level?: LogLevel, sessionId?: string): LogEntry[] {
    const filtered = this.logs.filter((entry) => {
      if (level && entry.level !== level) {
        return false;
      }
      if (sessionId && entry.sessionId !== sessionId) {
        return false;
      }
      return true;
    });
    return filtered.slice(-limit);
  }

  private append(level: LogLevel, message: string, source: string, sessionId?: string): void {
    const entry: LogEntry = {
      id: nanoid(10),
      timestamp: new Date().toISOString(),
      level,
      source,
      message,
      sessionId
    };
    this.logs.push(entry);
    for (const subscriber of this.subscribers) {
      try {
        subscriber(entry);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('Log subscriber failed', error);
      }
    }
    void this.persist();
  }

  private async persist(): Promise<void> {
    const logsPath = this.getLogPath();
    await fs.writeFile(logsPath, JSON.stringify(this.logs.slice(-500), null, 2), 'utf-8');
  }

  private getLogPath(): string {
    return path.join(this.storageDir, 'logs.json');
  }
}

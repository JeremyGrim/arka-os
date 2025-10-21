import { promises as fs } from 'fs';
import path from 'path';
import { ContextState, SessionSummary } from '../types';

const DEFAULT_CONTEXT: ContextState = {
  version: 1,
  timestamp: new Date().toISOString(),
  providers: [],
  sessions: []
};

export class ContextSyncEngine {
  private context: ContextState = { ...DEFAULT_CONTEXT };

  constructor(private readonly storageDir: string) {}

  async init(): Promise<void> {
    await fs.mkdir(this.storageDir, { recursive: true });
    const contextPath = this.getContextPath();
    try {
      const raw = await fs.readFile(contextPath, 'utf-8');
      this.context = JSON.parse(raw) as ContextState;
    } catch {
      await this.persist();
    }
  }

  getContext(): ContextState {
    return this.context;
  }

  getVersion(): number {
    return this.context.version;
  }

  getHistory(limit = 10): ContextState[] {
    const historyFile = path.join(this.storageDir, 'context-history.jsonl');
    try {
      const raw = require('fs').readFileSync(historyFile, 'utf-8') as string;
      const entries = raw.trim().split('\n').filter(Boolean).reverse();
      return entries.slice(0, limit).map((line) => JSON.parse(line));
    } catch {
      return [this.context];
    }
  }

  async updateContext(update: Partial<ContextState>): Promise<ContextState> {
    const nextVersion = this.context.version + 1;
    const merged: ContextState = {
      ...this.context,
      ...update,
      sessions: update.sessions ?? this.context.sessions,
      providers: update.providers ?? this.context.providers,
      version: nextVersion,
      timestamp: new Date().toISOString()
    };

    this.context = merged;
    await this.persist();
    return this.context;
  }

  syncSessions(sessions: SessionSummary[]): void {
    this.context.sessions = sessions.map((session) => ({ ...session }));
    this.context.timestamp = new Date().toISOString();
    this.context.version += 1;
    void this.persist();
  }

  private async persist(): Promise<void> {
    const contextPath = this.getContextPath();
    await fs.writeFile(contextPath, JSON.stringify(this.context, null, 2), 'utf-8');
    await this.appendHistory(this.context);
  }

  private async appendHistory(snapshot: ContextState): Promise<void> {
    const historyPath = path.join(this.storageDir, 'context-history.jsonl');
    await fs.appendFile(historyPath, `${JSON.stringify(snapshot)}\n`, 'utf-8');
  }

  private getContextPath(): string {
    return path.join(this.storageDir, 'context.json');
  }
}

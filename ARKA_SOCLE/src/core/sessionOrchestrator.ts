import { promises as fs } from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';
import { SessionSummary } from '../types';
import { ContextSyncEngine } from './contextSync';

export interface WakeupConfig {
  agentId: string;
  profile: string;
  provider: string;
  project?: string;
  simulate?: boolean;
}

export class SessionOrchestrator {
  private sessions: Map<string, SessionSummary> = new Map();

  constructor(
    private readonly storageDir: string,
    private readonly contextSync: ContextSyncEngine
  ) {}

  async init(): Promise<void> {
    await fs.mkdir(this.storageDir, { recursive: true });
    const sessionsPath = this.getSessionsPath();
    try {
      const raw = await fs.readFile(sessionsPath, 'utf-8');
      const list = JSON.parse(raw) as SessionSummary[];
      list.forEach((session) => this.sessions.set(session.id, session));
    } catch {
      await this.persist();
    }
  }

  listSessions(): SessionSummary[] {
    return Array.from(this.sessions.values());
  }

  getSession(sessionId: string): SessionSummary {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    return session;
  }

  async createSession(config: WakeupConfig): Promise<SessionSummary> {
    if (!config.agentId || !config.profile || !config.provider) {
      throw new Error('agentId, profile and provider are required');
    }

    const id = `session-${nanoid(8)}`;
    const now = new Date().toISOString();
    const session: SessionSummary = {
      id,
      agentId: config.agentId,
      profile: config.profile,
      provider: config.provider,
      status: 'active',
      terminalId: undefined,
      parked: true,
      duration: 0,
      createdAt: now,
      updatedAt: now,
      metadata: {
        project: config.project ?? 'default',
        simulate: !!config.simulate
      }
    };

    this.sessions.set(id, session);
    await this.persist();
    this.contextSync.syncSessions(this.listSessions());
    return session;
  }

  async destroySession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
    await this.persist();
    this.contextSync.syncSessions(this.listSessions());
  }

  async assignTerminal(sessionId: string, terminalId: number): Promise<void> {
    const session = this.getSession(sessionId);
    session.terminalId = terminalId;
    session.parked = terminalId === undefined;
    session.updatedAt = new Date().toISOString();
    await this.persist();
    this.contextSync.syncSessions(this.listSessions());
  }

  async pauseSession(sessionId: string): Promise<void> {
    const session = this.getSession(sessionId);
    session.status = 'paused';
    session.updatedAt = new Date().toISOString();
    await this.persist();
  }

  async resumeSession(sessionId: string): Promise<void> {
    const session = this.getSession(sessionId);
    session.status = 'active';
    session.updatedAt = new Date().toISOString();
    await this.persist();
  }

  private async persist(): Promise<void> {
    const sessionsPath = this.getSessionsPath();
    await fs.writeFile(sessionsPath, JSON.stringify(this.listSessions(), null, 2), 'utf-8');
  }

  private getSessionsPath(): string {
    return path.join(this.storageDir, 'sessions.json');
  }
}

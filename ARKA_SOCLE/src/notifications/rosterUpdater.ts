import path from "node:path";

import fs from "fs-extra";
import YAML from "yaml";

interface RosterAgent {
  agent_id: string;
  active?: boolean;
  session_id?: string | null;
  proposed_session_id?: string | null;
  updated_at?: string;
}

interface RosterFile {
  agents: RosterAgent[];
}

export class RosterUnavailableError extends Error {
  constructor(public readonly rosterPath: string) {
    super(`Roster absent: ${rosterPath}`);
    this.name = "RosterUnavailableError";
  }
}

export interface ApplyAckInput {
  agentId: string;
  sessionId: string;
  ackedAt: string;
}

export class RosterUpdater {
  constructor(private readonly baseDir: string, private readonly relativePath = path.join("ARKA_META", ".system", "coordination", "ROSTER.yaml")) {}

  private resolvePath(): string {
    return path.isAbsolute(this.relativePath) ? this.relativePath : path.join(this.baseDir, this.relativePath);
  }

  async applyAck(input: ApplyAckInput): Promise<void> {
    const rosterPath = this.resolvePath();
    if (!(await fs.pathExists(rosterPath))) {
      throw new RosterUnavailableError(rosterPath);
    }

    const roster = await this.loadRoster(rosterPath);
    const agent = this.ensureAgent(roster, input.agentId);
    agent.active = agent.active ?? true;
    agent.session_id = input.sessionId;
    agent.proposed_session_id = null;
    agent.updated_at = input.ackedAt;

    await this.saveRoster(rosterPath, roster);
  }

  private async loadRoster(filePath: string): Promise<RosterFile> {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = YAML.parse(raw) ?? {};
    const agentsRaw = Array.isArray(parsed.agents) ? parsed.agents : [];
    const agents: RosterAgent[] = [];
    for (const entry of agentsRaw) {
      if (!entry || typeof entry.agent_id !== "string" || !entry.agent_id.trim()) {
        continue;
      }
      agents.push({
        agent_id: entry.agent_id.trim(),
        active: typeof entry.active === "boolean" ? entry.active : undefined,
        session_id: normaliseId(entry.session_id),
        proposed_session_id: normaliseId(entry.proposed_session_id),
        updated_at: typeof entry.updated_at === "string" ? entry.updated_at : undefined,
      });
    }
    return { agents };
  }

  private async saveRoster(filePath: string, roster: RosterFile): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    const serialised = YAML.stringify({ agents: roster.agents }, { indent: 2 });
    await fs.writeFile(filePath, serialised, "utf-8");
  }

  private ensureAgent(roster: RosterFile, agentId: string): RosterAgent {
    let agent = roster.agents.find((entry) => entry.agent_id === agentId);
    if (!agent) {
      agent = {
        agent_id: agentId,
        active: true,
        session_id: null,
        proposed_session_id: null,
      };
      roster.agents.push(agent);
    }
    return agent;
  }
}

function normaliseId(value: unknown): string | null {
  if (!value) {
    return null;
  }
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

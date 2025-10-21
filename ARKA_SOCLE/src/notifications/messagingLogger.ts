import path from "node:path";

import fs from "fs-extra";
import YAML from "yaml";

interface GeneralEntry {
  ts: string;
  type: string;
  message_id: string;
  subject: string;
  from: string;
  to: string;
  notes?: string;
}

interface GeneralFile {
  version: number;
  entries: GeneralEntry[];
}

export class MessagingLogger {
  constructor(
    private readonly baseDir: string,
    private readonly relativePath = path.join("ARKA_META", "messaging", "general.yaml"),
  ) {}

  private resolvePath(): string {
    return path.isAbsolute(this.relativePath) ? this.relativePath : path.join(this.baseDir, this.relativePath);
  }

  async append(entry: GeneralEntry): Promise<void> {
    const target = this.resolvePath();
    const file = await this.readFile(target);
    file.entries.push(entry);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, YAML.stringify(file, { indent: 2 }), "utf-8");
  }

  async logAck(params: { deliveryId: string; sessionId: string; actionId: string; ackedAt: string; actor: string }): Promise<void> {
    const messageId = `msg-${params.deliveryId}-${Date.now()}`;
    await this.append({
      ts: params.ackedAt,
      type: "ack",
      message_id: messageId,
      subject: `Ack Session Notify ${params.deliveryId}`,
      from: "session-notify",
      to: params.actor,
      notes: `session=${params.sessionId} action=${params.actionId}`,
    });
  }

  private async readFile(filePath: string): Promise<GeneralFile> {
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      const parsed = YAML.parse(raw) ?? {};
      const entries = Array.isArray(parsed.entries) ? parsed.entries.filter(Boolean) : [];
      return {
        version: typeof parsed.version === "number" ? parsed.version : 1,
        entries,
      };
    } catch {
      return { version: 1, entries: [] };
    }
  }
}

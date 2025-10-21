import { promises as fs } from 'fs';
import path from 'path';

export type ConfigMap = Record<string, unknown>;

export class ConfigService {
  private config: ConfigMap = {};

  constructor(private readonly storageDir: string) {}

  async init(): Promise<void> {
    await fs.mkdir(this.storageDir, { recursive: true });
    try {
      const raw = await fs.readFile(this.getConfigPath(), 'utf-8');
      this.config = JSON.parse(raw) as ConfigMap;
    } catch {
      this.config = {
        'socle.environment': 'development',
        'socle.version': '0.1-d_beta',
        'logging.level': 'info'
      };
      await this.persist();
    }
  }

  get(key?: string): unknown {
    if (!key) {
      return this.config;
    }
    return this.config[key];
  }

  async set(key: string, value: unknown): Promise<void> {
    this.config[key] = value;
    await this.persist();
  }

  async reset(keys?: string[]): Promise<void> {
    if (!keys || keys.length === 0) {
      this.config = {};
    } else {
      keys.forEach((key) => delete this.config[key]);
    }
    await this.persist();
  }

  private async persist(): Promise<void> {
    await fs.writeFile(this.getConfigPath(), JSON.stringify(this.config, null, 2), 'utf-8');
  }

  private getConfigPath(): string {
    return path.join(this.storageDir, 'config.json');
  }
}

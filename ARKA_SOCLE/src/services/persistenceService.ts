import { promises as fs } from 'fs';
import path from 'path';
import { SocleState } from '../types';

export class PersistenceService {
  constructor(private readonly storageDir: string) {}

  async init(): Promise<void> {
    await fs.mkdir(this.storageDir, { recursive: true });
  }

  async saveState(state: SocleState): Promise<void> {
    const statePath = path.join(this.storageDir, 'state.json');
    await fs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf-8');
  }

  async readState(): Promise<SocleState | undefined> {
    const statePath = path.join(this.storageDir, 'state.json');
    try {
      const raw = await fs.readFile(statePath, 'utf-8');
      return JSON.parse(raw) as SocleState;
    } catch {
      return undefined;
    }
  }
}

import { promises as fs } from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';
import { MetaFileRecord } from '../types';

export type MetaFileType = 'input' | 'output' | 'memory' | 'log';

export interface SaveMetaFileParams {
  sessionId: string;
  name: string;
  type: MetaFileType;
  content: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface ListFilter {
  sessionId?: string;
  type?: MetaFileType;
}

export class MetaEngine {
  private files: MetaFileRecord[] = [];

  constructor(private readonly storageDir: string) {}

  async init(): Promise<void> {
    await fs.mkdir(this.storageDir, { recursive: true });
    const indexPath = this.getIndexPath();
    try {
      const raw = await fs.readFile(indexPath, 'utf-8');
      this.files = JSON.parse(raw) as MetaFileRecord[];
    } catch {
      await this.persist();
    }
  }

  async saveFile(params: SaveMetaFileParams): Promise<MetaFileRecord> {
    if (!params.sessionId) {
      throw new Error('sessionId is required');
    }

    const id = nanoid(12);
    const now = new Date().toISOString();
    const record: MetaFileRecord = {
      id,
      sessionId: params.sessionId,
      name: params.name,
      type: params.type,
      content: params.content,
      createdAt: now,
      updatedAt: now,
      tags: params.tags ?? [],
      size: Buffer.byteLength(params.content, 'utf-8'),
      metadata: params.metadata ?? {},
      path: path.join(this.storageDir, params.type, params.sessionId, `${id}.json`)
    };

    await fs.mkdir(path.dirname(record.path), { recursive: true });
    await fs.writeFile(record.path, JSON.stringify(record, null, 2), 'utf-8');

    this.files.push(record);
    await this.persist();
    return record;
  }

  listFiles(filter: ListFilter = {}): MetaFileRecord[] {
    return this.files.filter((file) => {
      if (filter.sessionId && file.sessionId !== filter.sessionId) {
        return false;
      }
      if (filter.type && file.type !== filter.type) {
        return false;
      }
      return true;
    });
  }

  searchByTag(tag: string): MetaFileRecord[] {
    return this.files.filter((file) => file.tags.includes(tag));
  }

  private getIndexPath(): string {
    return path.join(this.storageDir, 'index', 'files.json');
  }

  private async persist(): Promise<void> {
    const indexPath = this.getIndexPath();
    await fs.mkdir(path.dirname(indexPath), { recursive: true });
    await fs.writeFile(indexPath, JSON.stringify(this.files, null, 2), 'utf-8');
  }
}

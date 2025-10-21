import { promises as fs } from 'fs';
import path from 'path';
import { ModuleDefinition } from '../types';

const DEFAULT_MODULES: ModuleDefinition[] = [
  {
    id: 'arka_core',
    name: 'ARKA Core',
    version: '1.0.0',
    type: 'core',
    priority: 1,
    enabled: true,
    status: 'ready',
    dependencies: [],
    adapter: 'adapters/core_adapter.yaml'
  },
  {
    id: 'arka_os',
    name: 'ARKA OS',
    version: '1.0.0',
    type: 'core',
    priority: 1,
    enabled: true,
    status: 'ready',
    dependencies: ['arka_core'],
    adapter: 'adapters/os_adapter.yaml'
  },
  {
    id: 'arka_cli',
    name: 'ARKA CLI',
    version: '1.0.0',
    type: 'local',
    priority: 2,
    enabled: true,
    status: 'ready',
    dependencies: ['arka_core', 'arka_os'],
    adapter: 'adapters/cli_adapter.yaml'
  },
  {
    id: 'arka_meta',
    name: 'ARKA MetaEngine',
    version: '1.0.0',
    type: 'meta',
    priority: 3,
    enabled: true,
    status: 'ready',
    dependencies: ['arka_core'],
    adapter: 'adapters/meta_adapter.yaml'
  },
  {
    id: 'adapter_router_advanced',
    name: 'Advanced Adapter Router',
    version: '1.0.0',
    type: 'extension',
    priority: 5,
    enabled: false,
    status: 'ready',
    dependencies: ['arka_core']
  },
  {
    id: 'fallback_engine',
    name: 'Fallback Engine',
    version: '1.0.0',
    type: 'extension',
    priority: 6,
    enabled: false,
    status: 'ready',
    dependencies: ['adapter_router_advanced']
  },
  {
    id: 'circuit_breaker',
    name: 'Circuit Breaker',
    version: '1.0.0',
    type: 'extension',
    priority: 6,
    enabled: false,
    status: 'ready',
    dependencies: ['fallback_engine']
  }
];

export class ModuleManager {
  private modules: ModuleDefinition[] = [];

  constructor(private readonly storageDir: string) {}

  async init(): Promise<void> {
    await fs.mkdir(this.storageDir, { recursive: true });
    const registryPath = path.join(this.storageDir, 'registry.json');

    try {
      const raw = await fs.readFile(registryPath, 'utf-8');
      this.modules = JSON.parse(raw);
    } catch {
      this.modules = DEFAULT_MODULES;
      await fs.writeFile(registryPath, JSON.stringify(this.modules, null, 2), 'utf-8');
    }
  }

  list(): ModuleDefinition[] {
    return [...this.modules];
  }

  listHealth(): Array<Pick<ModuleDefinition, 'id' | 'name' | 'version' | 'status' | 'priority'>> {
    return this.modules.map(({ id, name, version, status, priority }) => ({
      id,
      name,
      version,
      status,
      priority
    }));
  }

  async setEnabled(moduleId: string, enabled: boolean): Promise<void> {
    const module = this.modules.find((mod) => mod.id === moduleId);
    if (!module) {
      throw new Error(`Module ${moduleId} not found`);
    }

    if (enabled) {
      this.ensureDependencies(moduleId);
    }

    module.enabled = enabled;
    module.status = enabled ? 'ready' : 'stopped';
    await this.persist();
  }

  markDegraded(moduleId: string, reason = 'Unknown'): void {
    const module = this.modules.find((mod) => mod.id === moduleId);
    if (module) {
      module.status = 'degraded';
      if (!module.dependencies.includes(reason)) {
        module.dependencies = [...module.dependencies, reason];
      }
    }
  }

  getModule(moduleId: string): ModuleDefinition | undefined {
    return this.modules.find((mod) => mod.id === moduleId);
  }

  private ensureDependencies(moduleId: string): void {
    const module = this.modules.find((mod) => mod.id === moduleId);
    if (!module) {
      return;
    }

    module.dependencies.forEach((dependencyId) => {
      const dependency = this.modules.find((mod) => mod.id === dependencyId);
      if (!dependency) {
        throw new Error(`Missing dependency ${dependencyId} for module ${moduleId}`);
      }
      if (!dependency.enabled) {
        dependency.enabled = true;
        dependency.status = 'ready';
        this.ensureDependencies(dependency.id);
      }
    });
  }

  private async persist(): Promise<void> {
    const registryPath = path.join(this.storageDir, 'registry.json');
    await fs.writeFile(registryPath, JSON.stringify(this.modules, null, 2), 'utf-8');
  }
}

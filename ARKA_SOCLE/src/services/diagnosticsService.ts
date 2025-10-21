import { DiagnosticsReport } from '../types';
import { ModuleManager } from '../core/moduleManager';

export class DiagnosticsService {
  constructor(private readonly moduleManager: ModuleManager) {}

  run(): DiagnosticsReport {
    const modules = this.moduleManager.list();
    const degraded = modules.filter((module) => module.status !== 'ready');

    return {
      timestamp: new Date().toISOString(),
      health: degraded.length === 0 ? 'pass' : 'warn',
      summary: degraded.length === 0
        ? 'Tous les modules sont opérationnels.'
        : `${degraded.length} module(s) en état dégradé`,
      checks: modules.map((module) => ({
        component: module.name,
        status: module.status === 'ready' ? 'pass' : (module.status === 'degraded' ? 'warn' : 'fail'),
        details: [
          `Version ${module.version}`,
          module.enabled ? 'Activé' : 'Désactivé',
          `Priorité ${module.priority}`
        ]
      }))
    };
  }
}

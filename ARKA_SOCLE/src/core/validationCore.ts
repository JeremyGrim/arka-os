import { ValidationIssue, ValidationReport } from '../types';
import { ModuleManager } from './moduleManager';

export class ValidationCore {
  constructor(private readonly moduleManager: ModuleManager) {}

  validateConfiguration(): ValidationReport {
    const issues: ValidationIssue[] = [];

    const modules = this.moduleManager.list();
    modules.forEach((module) => {
      module.dependencies.forEach((dependencyId) => {
        const dependency = modules.find((mod) => mod.id === dependencyId);
        if (!dependency) {
          issues.push({
            code: 'MODULE_DEPENDENCY_MISSING',
            message: `Module ${module.id} requires ${dependencyId}`,
            path: `modules.${module.id}`,
            hint: 'Ajoutez la dépendance manquante dans registry.json'
          });
        }
      });
    });

    return {
      valid: issues.length === 0,
      errors: issues,
      warnings: [],
      checkedAt: new Date().toISOString()
    };
  }
}

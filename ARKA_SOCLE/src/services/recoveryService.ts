import { RecoveryStatus, RecoveryStrategy } from '../types';

export class RecoveryService {
  private status: RecoveryStatus = {
    inProgress: false,
    strategies: []
  };

  constructor(private readonly modules: () => RecoveryStrategy[]) {}

  getStatus(): RecoveryStatus {
    return {
      inProgress: this.status.inProgress,
      lastRun: this.status.lastRun,
      strategies: this.status.strategies
    };
  }

  trigger(moduleId?: string, strategy?: RecoveryStrategy['strategy']): void {
    const now = new Date().toISOString();
    this.status.inProgress = true;
    this.status.lastRun = now;

    const strategies = moduleId
      ? this.modules().filter((item) => item.moduleId === moduleId)
      : this.modules();

    this.status.strategies = strategies.map((item) => ({
      ...item,
      status: 'recovered',
      attempts: item.attempts + 1,
      lastAttempt: now,
      strategy: strategy ?? item.strategy
    }));

    this.status.inProgress = false;
  }
}

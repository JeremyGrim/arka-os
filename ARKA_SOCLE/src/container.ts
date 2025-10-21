import path from 'path';
import { EventEmitter } from 'events';
import { ModuleManager } from './core/moduleManager';
import { ContextSyncEngine } from './core/contextSync';
import { SessionOrchestrator } from './core/sessionOrchestrator';
import { MetaEngine } from './core/metaEngine';
import { ValidationCore } from './core/validationCore';
import { LogService } from './services/logService';
import { ConfigService } from './services/configService';
import { EventBus } from './services/eventBus';
import { PersistenceService } from './services/persistenceService';
import { RecoveryService } from './services/recoveryService';
import { DiagnosticsService } from './services/diagnosticsService';
import { RouterService } from './extensions/routerService';
import { FallbackEngine } from './extensions/fallbackEngine';
import { CircuitBreakerService } from './extensions/circuitBreaker';
import { ProviderMetricsService } from './services/providerMetricsService';
import { ObservabilityService } from './services/observabilityService';
import { NotificationOrchestrator, SYSTEM_CLOCK } from './notifications/domain';
import { InMemoryNotificationStore } from './notifications/store/inMemoryStore';
import { bindNotificationHooks } from './notifications/hooks';
import { RosterUpdater } from './notifications/rosterUpdater';
import { MessagingLogger } from './notifications/messagingLogger';
import { FailureAlertPort } from './notifications/failureAlertPort';
import { NotificationScheduler } from './notifications/scheduler/notificationScheduler';
import type { RecoveryStrategy } from './types';

export interface Container {
  moduleManager: ModuleManager;
  contextSync: ContextSyncEngine;
  sessionOrchestrator: SessionOrchestrator;
  metaEngine: MetaEngine;
  validationCore: ValidationCore;
  logService: LogService;
  configService: ConfigService;
  eventBus: EventBus;
  persistence: PersistenceService;
  recovery: RecoveryService;
  diagnostics: DiagnosticsService;
  routerService: RouterService;
  fallbackEngine: FallbackEngine;
  circuitBreaker: CircuitBreakerService;
  providerMetrics: ProviderMetricsService;
  observability: ObservabilityService;
  notificationStore: InMemoryNotificationStore;
  notificationOrchestrator: NotificationOrchestrator;
  notificationEvents: EventEmitter;
  rosterUpdater: RosterUpdater;
  messagingLogger: MessagingLogger;
  notificationScheduler: NotificationScheduler;
  failureAlert: FailureAlertPort;
  init(): Promise<void>;
}

export const createContainer = (baseDir: string): Container => {
  const storageDir = path.join(baseDir, 'data');
  const moduleManager = new ModuleManager(path.join(storageDir, 'core'));
  const contextSync = new ContextSyncEngine(path.join(storageDir, 'context'));
  const logService = new LogService(path.join(storageDir, 'logs'));
  const sessionOrchestrator = new SessionOrchestrator(path.join(storageDir, 'sessions'), contextSync);
  const metaEngine = new MetaEngine(path.join(storageDir, 'meta'));
  const validationCore = new ValidationCore(moduleManager);
  const configService = new ConfigService(path.join(storageDir, 'config'));
  const persistence = new PersistenceService(path.join(storageDir, 'core'));
  const eventBus = new EventBus(logService);
  const providerMetrics = new ProviderMetricsService(logService, eventBus);
  const observability = new ObservabilityService(path.join(storageDir, 'observability'), logService);
  const notificationStore = new InMemoryNotificationStore();
  const notificationOrchestrator = new NotificationOrchestrator(notificationStore, SYSTEM_CLOCK);
  const notificationEvents = new EventEmitter();
  bindNotificationHooks({ events: notificationEvents, orchestrator: notificationOrchestrator });
  const rosterUpdater = new RosterUpdater(baseDir);
  const messagingLogger = new MessagingLogger(baseDir);
  const failureAlert = new FailureAlertPort(logService, messagingLogger);
  const notificationScheduler = new NotificationScheduler(notificationStore, notificationOrchestrator, failureAlert, logService);

  const recoveryStrategies = (): RecoveryStrategy[] => moduleManager.list().map((module) => ({
    moduleId: module.id,
    status: module.enabled ? 'idle' : 'failed',
    attempts: 0,
    strategy: 'restart'
  }));

  const recovery = new RecoveryService(recoveryStrategies);
  const diagnostics = new DiagnosticsService(moduleManager);
  const routerService = new RouterService(moduleManager, logService, providerMetrics);
  const fallbackEngine = new FallbackEngine(moduleManager, routerService, logService, recovery);
  const circuitBreaker = new CircuitBreakerService(fallbackEngine, logService);

  fallbackEngine.onFallbackTriggered((event) => {
    logService.warn(`Fallback event ${event.primaryId} -> ${event.fallbackId}: ${event.reason}`, 'fallback');
  });

  return {
    moduleManager,
    contextSync,
    sessionOrchestrator,
    metaEngine,
    validationCore,
    logService,
    configService,
    eventBus,
    persistence,
    recovery,
    diagnostics,
    routerService,
    fallbackEngine,
    circuitBreaker,
    providerMetrics,
    observability,
    notificationStore,
    notificationOrchestrator,
    notificationEvents,
    rosterUpdater,
    messagingLogger,
    notificationScheduler,
    failureAlert,
    async init() {
      await Promise.all([
        moduleManager.init(),
        contextSync.init(),
        logService.init(),
        observability.init(),
        sessionOrchestrator.init(),
        metaEngine.init(),
        configService.init(),
        persistence.init()
      ]);
      circuitBreaker.evaluateTimeouts();
    }
  };
};

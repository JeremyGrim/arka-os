export type ModuleStatus = 'ready' | 'degraded' | 'stopped';

export interface ModuleDefinition {
  id: string;
  name: string;
  version: string;
  type: 'core' | 'local' | 'meta' | 'extension';
  priority: number;
  enabled: boolean;
  status: ModuleStatus;
  dependencies: string[];
  adapter?: string;
}

export interface ContextState {
  version: number;
  timestamp: string;
  user?: {
    id: string;
    name: string;
    role: string;
  };
  project?: {
    id: string;
    name: string;
    path?: string;
  };
  providers: Array<{
    id: string;
    name: string;
    type: string;
    connected: boolean;
  }>;
  sessions: SessionSummary[];
}

export interface SessionSummary {
  id: string;
  agentId: string;
  profile: string;
  provider: string;
  status: 'active' | 'paused' | 'stopped';
  terminalId?: number;
  parked: boolean;
  duration: number;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface SocleState {
  version: string;
  status: 'ready' | 'degraded' | 'error';
  uptime: number;
  context: ContextState;
}

export interface MetaFileRecord {
  id: string;
  sessionId: string;
  name: string;
  type: 'input' | 'output' | 'memory' | 'log';
  content: string;
  createdAt: string;
  updatedAt: string;
  path: string;
  tags: string[];
  size: number;
  metadata: Record<string, unknown>;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  source: string;
  message: string;
  sessionId?: string;
}

export interface ValidationIssue {
  code: string;
  message: string;
  path?: string;
  hint?: string;
}

export interface ValidationReport {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  checkedAt: string;
}

export interface RecoveryStrategySummary {
  moduleId: string;
  status: 'idle' | 'running' | 'failed' | 'recovered';
  attempts: number;
  lastAttempt?: string;
  strategy: string;
}

export interface RecoveryStatus {
  inProgress: boolean;
  lastRun?: string;
  strategies: RecoveryStrategySummary[];
}

export interface DiagnosticsReport {
  timestamp: string;
  health: 'pass' | 'warn' | 'fail';
  summary: string;
  checks: Array<{
    component: string;
    status: 'pass' | 'warn' | 'fail';
    details?: string[];
  }>;
}

export type LoadBalancingStrategy =
  | 'round_robin'
  | 'least_loaded'
  | 'least_connections'
  | 'least_response_time'
  | 'weighted'
  | 'ip_hash';

export type RoutingStrategy =
  | 'round_robin'
  | 'priority'
  | 'sticky_session'
  | 'content_based'
  | 'geo_aware'
  | 'failover';

export type RouterStrategy = LoadBalancingStrategy | RoutingStrategy;

export interface RouterModuleInstance {
  id: string;
  address?: string;
  weight?: number;
  capacity?: number;
  metadata?: Record<string, unknown>;
  registeredAt: string;
}

export interface RouterQueuedRequest {
  id: string;
  priority: number;
  enqueuedAt: string;
  payload?: unknown;
}

export interface RouterCacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  size: number;
  evictions: number;
}

export interface RouterQueueStatus {
  size: number;
  processing: number;
  waiting: number;
  dropped: number;
  priority: 'fifo' | 'lifo' | 'priority';
  timeout: number;
}

export interface RouterModuleMetrics {
  calls: number;
  averageLatencyMs: number;
  lastRoutedAt?: string;
  activeConnections?: number;
  requestsPerSecond?: number;
  errorRate?: number;
  lastErrorAt?: string;
}

export interface RouterStrategyConfig {
  strategy: RouterStrategy;
  targets: string[];
  weights: Record<string, number>;
  useCache: boolean;
  cacheTtl: number;
  cacheMaxSize: number;
  cacheStrategy: 'lru' | 'lfu' | 'fifo';
  cacheStats: RouterCacheStats;
  queueEnabled: boolean;
  queuePriority: 'fifo' | 'lifo' | 'priority';
  queueTimeout: number;
  maxQueue: number;
  queue: RouterQueuedRequest[];
  lastRoutedIndex: number;
  metrics: Record<string, RouterModuleMetrics>;
  instances: Record<string, RouterModuleInstance>;
  loadBalancing?: LoadBalancingStrategy;
  routingMode?: RoutingStrategy;
}

export interface ProviderMetricSnapshot {
  providerId: string;
  dispatchCount: number;
  switchInCount: number;
  switchOutCount: number;
  averageLatencyMs: number;
  lastLatencyMs?: number;
  lastDispatchAt?: string;
  lastSwitchAt?: string;
}

export interface ProviderMetricsReport {
  totalDispatches: number;
  totalSwitches: number;
  providers: ProviderMetricSnapshot[];
  generatedAt: string;
}

export interface RouterStatus {
  modules: Record<string, RouterStrategyConfig>;
  cache: {
    enabled: boolean;
    entries: number;
    stats: RouterCacheStats;
  };
  queue: RouterQueueStatus;
}

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitConfig {
  failureThreshold: number;
  successThreshold: number;
  timeoutMs: number;
  halfOpenTimeout?: number;
  resetTimeout?: number;
}

export interface CircuitMetrics {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailure?: string;
  lastSuccess?: string;
  openedAt?: string;
  nextAttempt?: string;
}

export interface CircuitStatusItem {
  moduleId: string;
  state: CircuitState;
  failureCount: number;
  successCount: number;
  openedAt?: string;
  lastError?: string;
  config: CircuitConfig;
  metrics: CircuitMetrics;
}

export interface CircuitStatus {
  modules: CircuitStatusItem[];
}

export interface ErrorThreshold {
  maxErrors: number;
  timeWindow: number;
  action: 'fallback' | 'restart' | 'disable' | 'notify';
}

export interface HealthCheckConfig {
  interval: number;
  timeout: number;
  retries: number;
  failureThreshold: number;
  successThreshold: number;
}

export interface HealthStatus {
  moduleId: string;
  status: 'healthy' | 'degraded' | 'unreachable';
  latencyMs: number;
  attempts: number;
  lastError?: string;
  checkedAt: string;
}

export type FallbackRecoveryStrategy =
  | 'restart'
  | 'reload'
  | 'replace'
  | 'manual'
  | 'backoff';

export interface RecoveryResult {
  success: boolean;
  strategy: FallbackRecoveryStrategy;
  attempts: number;
  durationMs: number;
  error?: string;
}

export interface RouteStatus {
  currentModuleId: string;
  isPrimary: boolean;
  fallbackLevel: number;
  lastSwitch: string;
  reason?: string;
}

export interface FallbackMetrics {
  totalFallbacks: number;
  activeFailovers: number;
  successfulRecoveries: number;
  failedRecoveries: number;
  avgRecoveryTime: number;
}

export interface FallbackEvent {
  type: 'triggered' | 'recovered' | 'failed';
  primaryId: string;
  fallbackId: string;
  reason: string;
  timestamp: string;
}

export interface FallbackStatus {
  chains: Record<string, string[]>;
  routes: Record<string, RouteStatus>;
  thresholds: Record<string, ErrorThreshold>;
  metrics: FallbackMetrics;
  healthChecks: Record<string, HealthCheckConfig>;
  recoveries: RecoveryResult[];
}

export type RecoveryStrategy = RecoveryStrategySummary;

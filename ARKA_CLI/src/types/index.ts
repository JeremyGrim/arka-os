// src/types/index.ts

export interface SocleClientConfig {
  baseUrl: string
  timeout: number
  retries: number
  enforceTls?: boolean
  notifyToken?: string
}

export interface SocleState {
  version: string
  status: string
  uptime: number
  context?: any
}

export interface ModuleHealth {
  id: string
  name: string
  version: string
  status: string
  health: string
  priority: number
}

export interface Module {
  id: string
  name: string
  version: string
  status: string
  priority: number
  enabled: boolean
  health?: string
}

export interface Session {
  id: string
  agentId: string
  profile: string
  provider: string
  status: string
  terminalId?: number
  parked: boolean
  duration: number
}

export interface WakeupConfig {
  agentId: string
  profile: string
  provider: string
  project?: string
  simulate?: boolean
}

export interface MetaFile {
  id: string
  sessionId: string
  name: string
  type: 'input' | 'output'
  content: string
  createdAt: Date
  updatedAt: Date
  path: string
  tags: string[]
  size: number
  metadata: any
}

export interface FileFilter {
  sessionId?: string
  type?: string
}

export interface Context {
  version: number
  timestamp: Date
  user?: {
    id: string
    name: string
    role: string
  }
  project?: {
    id: string
    name: string
  }
  providers?: Array<{
    name: string
    connected: boolean
  }>
  sessions?: Array<{
    id: string
    status: string
    terminalId?: number
  }>
}

export type ContextUpdate = Partial<Context> & {
  metadata?: Record<string, any>
}

export interface LogsOptions {
  session?: string
  limit?: number
  level?: string
}

export interface LogEntry {
  timestamp: Date
  level: string
  source: string
  message: string
  sessionId?: string
}

export interface InitOptions {
  path: string
  force?: boolean
  template: string
}

export interface StatusOptions {
  json?: boolean
}

export interface SessionCreateOptions {
  agent: string
  profile: string
  provider: string
  project?: string
  terminal?: number
  simulate?: boolean
}

export interface SessionListOptions {
  json?: boolean
}

export interface SessionLogsOptions {
  session?: string
  tail?: boolean
  level?: string
}

export interface FileInjectOptions {
  session?: string
  type: 'input' | 'output'
  tags?: string
}

export interface FileListOptions {
  session?: string
  type?: string
  json?: boolean
}

export interface LogsCommandOptions {
  tail?: boolean
  session?: string
  level?: string
}

export interface ValidationIssue {
  code: string
  message: string
  path?: string
  hint?: string
}

export interface ValidationResultSummary {
  valid: boolean
  errors: ValidationIssue[]
  warnings: ValidationIssue[]
  checkedAt: string
}

export interface ReportData {
  generatedAt: string
  environment: string
  socle: SocleState
  modules: Module[]
  sessions: Session[]
  context: Context
}

export interface RecoveryStatus {
  inProgress: boolean
  lastRun?: string
  strategies: RecoveryStrategySummary[]
}

export interface RecoveryStrategySummary {
  moduleId: string
  status: 'idle' | 'running' | 'failed' | 'recovered'
  attempts: number
  lastAttempt?: string
  strategy: string
}

export interface RecoveryTriggerOptions {
  moduleId?: string
  strategy?: string
}

export interface DiagnosticsReport {
  timestamp: string
  health: 'pass' | 'warn' | 'fail'
  summary: string
  checks: DiagnosticCheck[]
}

export interface DiagnosticCheck {
  component: string
  status: 'pass' | 'warn' | 'fail'
  details?: string[]
}

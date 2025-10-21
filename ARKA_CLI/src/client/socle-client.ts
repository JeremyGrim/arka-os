// src/client/socle-client.ts

import axios, { AxiosError, AxiosInstance } from 'axios'
import { EventEmitter } from 'events'
import {
  SocleClientConfig,
  SocleState,
  ModuleHealth,
  Module,
  Session,
  WakeupConfig,
  MetaFile,
  FileFilter,
  Context,
  ContextUpdate,
  LogsOptions,
  LogEntry,
  ValidationResultSummary,
  ReportData,
  RecoveryStatus,
  RecoveryTriggerOptions,
  DiagnosticsReport
} from '../types/index.js'
import { CLIError, CLIErrorCode } from '../utils/errors.js'

export class SocleClient extends EventEmitter {
  private client: AxiosInstance
  private baseUrl: string
  private timeout: number
  private retries: number
  private enforceTls: boolean

  constructor(config?: Partial<SocleClientConfig>) {
    super()

    this.baseUrl = config?.baseUrl || process.env.ARKA_SOCLE_URL || 'http://localhost:9090'
    this.timeout = config?.timeout || 30000
    this.retries = config?.retries || 3
    const enforceTlsEnv = process.env.SOCLE_ENFORCE_TLS
    const defaultEnforceTls =
      enforceTlsEnv === undefined ? (process.env.NODE_ENV === 'production') : enforceTlsEnv.toLowerCase() !== 'false'
    this.enforceTls = config?.enforceTls ?? defaultEnforceTls

    const allowInsecureOverride =
      (process.env.SOCLE_ALLOW_INSECURE_HTTP ?? '').toLowerCase() === 'true' ||
      (process.env.SOCLE_ALLOW_INSECURE_HTTP ?? '').toLowerCase() === '1'

    if (this.enforceTls && this.baseUrl.startsWith('http://')) {
      console.warn(`[socle-client] TLS requis mais ARKA_SOCLE_URL=${this.baseUrl} utilise HTTP.`)
      if (!allowInsecureOverride) {
        throw new CLIError(
          CLIErrorCode.CONNECTION_FAILED,
          'URL SOCLE non sécurisée. HTTPS requis en production.',
          [
            'Mets à jour ARKA_SOCLE_URL pour utiliser https://',
            'Définis SOCLE_ALLOW_INSECURE_HTTP=true uniquement si le canal est isolé'
          ]
        )
      }
    }

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'X-CLI-Version': '1.0.0-core'
      }
    })

    const notifyToken = config?.notifyToken ?? process.env.SOCLE_NOTIFY_TOKEN
    if (typeof notifyToken === 'string' && notifyToken.trim().length > 0) {
      this.client.defaults.headers.common.Authorization = `Bearer ${notifyToken.trim()}`
      this.client.defaults.headers.common['X-Socle-Token'] = notifyToken.trim()
    }

    this.setupInterceptors()
  }

  private setupInterceptors(): void {
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const config: any = error.config

        if (!config || typeof config !== 'object') {
          return Promise.reject(this.mapError(error))
        }

        if (!config._retryCount) {
          config._retryCount = 0
        }

        if (config._retryCount < this.retries && this.isRetryable(error)) {
          config._retryCount++
          await this.delay(1000 * config._retryCount)
          return this.client(config)
        }

        return Promise.reject(this.mapError(error))
      }
    )
  }

  private isRetryable(error: AxiosError): boolean {
    if (!error.response) {
      return true
    }

    const status = error.response.status
    return status >= 500 || status === 429
  }

  private mapError(error: AxiosError): CLIError {
    if (error.code === 'ECONNREFUSED') {
      return new CLIError(
        CLIErrorCode.SOCLE_NOT_RUNNING,
        'Cannot connect to SOCLE'
      )
    }

    if (error.code === 'ETIMEDOUT') {
      return new CLIError(
        CLIErrorCode.TIMEOUT,
        'Request timeout'
      )
    }

    if (!error.response) {
      return new CLIError(
        CLIErrorCode.CONNECTION_FAILED,
        error.message
      )
    }

    const status = error.response.status

    if (status === 404) {
      return new CLIError(
        CLIErrorCode.SESSION_NOT_FOUND,
        'Resource not found',
        ['Verify the identifier', 'List resources before retrying']
      )
    }

    if (status === 409) {
      return new CLIError(
        CLIErrorCode.INVALID_PARAMS,
        'Operation conflicts with current state'
      )
    }

    if (status === 422) {
      return new CLIError(
        CLIErrorCode.INVALID_PARAMS,
        'Payload rejected by SOCLE',
        ['Inspect validation errors with --debug']
      )
    }

    if (status === 503) {
      return new CLIError(
        CLIErrorCode.SOCLE_NOT_RUNNING,
        'SOCLE service unavailable'
      )
    }

    return new CLIError(
      CLIErrorCode.INTERNAL_ERROR,
      `Unexpected error (${status})`
    )
  }

  async connect(): Promise<void> {
    try {
      await this.client.get('/health')
    } catch {
      throw new CLIError(
        CLIErrorCode.CONNECTION_FAILED,
        'Cannot connect to SOCLE. Is it running?',
        ['Check SOCLE status: arka status', `Verify SOCLE_URL (current: ${this.baseUrl})`]
      )
    }
  }

  // Socle State
  async getSocleState(): Promise<SocleState> {
    const response = await this.client.get('/api/socle/state')
    return response.data
  }

  async getModulesHealth(): Promise<ModuleHealth[]> {
    const response = await this.client.get('/api/modules/health')
    return response.data
  }

  async loadCoreModules(): Promise<void> {
    await this.client.post('/api/socle/init')
  }

  // Modules
  async listModules(): Promise<Module[]> {
    const response = await this.client.get('/api/modules')
    return response.data
  }

  async enableModule(moduleId: string): Promise<void> {
    await this.client.post(`/api/modules/${moduleId}/enable`)
  }

  async disableModule(moduleId: string): Promise<void> {
    await this.client.post(`/api/modules/${moduleId}/disable`)
  }

  // Sessions
  async createSession(wakeup: WakeupConfig): Promise<Session> {
    const response = await this.client.post('/api/sessions', wakeup)
    return response.data
  }

  async listSessions(): Promise<Session[]> {
    const response = await this.client.get('/api/sessions')
    return response.data
  }

  async getSession(sessionId: string): Promise<Session> {
    const response = await this.client.get(`/api/sessions/${sessionId}`)
    return response.data
  }

  async destroySession(sessionId: string): Promise<void> {
    await this.client.delete(`/api/sessions/${sessionId}`)
  }

  async assignTerminal(sessionId: string, terminalId: number): Promise<void> {
    await this.client.post(`/api/sessions/${sessionId}/terminal`, { terminalId })
  }

  async notifySession(sessionId: string, text: string): Promise<void> {
    await this.client.post(`/api/sessions/${sessionId}/notify`, { text })
  }

  async getActiveSessions(): Promise<Session[]> {
    const response = await this.client.get('/api/sessions', {
      params: { status: 'active' }
    })
    return response.data
  }

  async validateWakeupConfig(config: WakeupConfig): Promise<void> {
    await this.client.post('/api/sessions/validate', config)
  }

  // Files
  async saveFile(file: MetaFile): Promise<void> {
    await this.client.post('/api/meta/files', file)
  }

  async listFiles(filter?: FileFilter): Promise<MetaFile[]> {
    const response = await this.client.get('/api/meta/files', {
      params: filter
    })
    return response.data
  }

  async searchByTag(tag: string): Promise<MetaFile[]> {
    const response = await this.client.get('/api/meta/search', {
      params: { tag }
    })
    return response.data
  }

  // Context
  async getContext(): Promise<Context> {
    const response = await this.client.get('/api/context')
    return response.data
  }

  async getContextVersion(): Promise<number> {
    const response = await this.client.get('/api/context/version')
    return response.data.version
  }

  async pushContext(update: ContextUpdate): Promise<Context> {
    const response = await this.client.put('/api/context', update)
    return response.data
  }

  // Config
  async getConfig(key?: string): Promise<any> {
    const response = await this.client.get('/api/config', {
      params: key ? { key } : undefined
    })
    return response.data
  }

  async setConfig(key: string, value: any): Promise<void> {
    await this.client.put('/api/config', { key, value })
  }

  async resetConfig(keys?: string[]): Promise<void> {
    await this.client.request({
      url: '/api/config',
      method: 'DELETE',
      data: keys && keys.length > 0 ? { keys } : undefined
    })
  }

  async validateConfiguration(): Promise<ValidationResultSummary> {
    const response = await this.client.post('/api/config/validate')
    return response.data
  }

  // Reports
  async generateReport(): Promise<ReportData> {
    const response = await this.client.get('/api/reports/state')
    return response.data
  }

  // Recovery
  async getRecoveryStatus(): Promise<RecoveryStatus> {
    const response = await this.client.get('/api/recovery')
    return response.data
  }

  async triggerRecovery(options: RecoveryTriggerOptions): Promise<void> {
    await this.client.post('/api/recovery/trigger', options)
  }

  // Diagnostics
  async getDiagnostics(): Promise<DiagnosticsReport> {
    const response = await this.client.get('/api/diagnostics')
    return response.data
  }

  // Logs
  async getLogs(options: LogsOptions): Promise<LogEntry[]> {
    const response = await this.client.get('/api/logs', {
      params: options
    })
    return response.data
  }

  async streamLogs(
    options: LogsOptions,
    callback: (log: LogEntry) => void
  ): Promise<void> {
    const response = await this.client.get('/api/logs/stream', {
      params: options,
      responseType: 'stream'
    })

    response.data.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n')
      lines.forEach((line) => {
        if (line.trim()) {
          try {
            const log = JSON.parse(line)
            callback(log)
          } catch {
            // Skip malformed line
          }
        }
      })
    })

    response.data.on('error', (error: Error) => {
      this.emit('stream-error', error)
    })
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

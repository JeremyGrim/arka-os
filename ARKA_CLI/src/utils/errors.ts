// src/utils/errors.ts

export enum CLIErrorCode {
  // Connection
  CONNECTION_FAILED = 'E001',
  TIMEOUT = 'E002',
  SOCLE_NOT_RUNNING = 'E003',

  // Validation
  INVALID_COMMAND = 'E101',
  INVALID_PARAMS = 'E102',
  FILE_NOT_FOUND = 'E103',
  FILE_TOO_LARGE = 'E104',

  // Session
  SESSION_NOT_FOUND = 'E201',
  SESSION_CREATE_FAILED = 'E202',

  // Module
  MODULE_NOT_FOUND = 'E301',

  // Generic
  INTERNAL_ERROR = 'E999'
}

export class CLIError extends Error {
  constructor(
    public code: CLIErrorCode,
    message: string,
    public suggestions?: string[]
  ) {
    super(message)
    this.name = 'CLIError'
  }
}

interface ErrorMessage {
  message: string
  suggestions: string[]
}

export const ERROR_MESSAGES: Record<CLIErrorCode, ErrorMessage> = {
  [CLIErrorCode.CONNECTION_FAILED]: {
    message: 'Connection to SOCLE failed',
    suggestions: [
      'Check if SOCLE is running',
      'Verify SOCLE_URL environment variable',
      'Check network connectivity'
    ]
  },

  [CLIErrorCode.TIMEOUT]: {
    message: 'Request timeout',
    suggestions: [
      'Retry the operation',
      'Check SOCLE responsiveness'
    ]
  },

  [CLIErrorCode.SOCLE_NOT_RUNNING]: {
    message: 'SOCLE is not running',
    suggestions: [
      'Initialize SOCLE: arka init',
      'Check SOCLE status: arka status',
      'Verify SOCLE_URL environment variable'
    ]
  },

  [CLIErrorCode.INVALID_COMMAND]: {
    message: 'Invalid command',
    suggestions: [
      'Run arka --help for available commands'
    ]
  },

  [CLIErrorCode.INVALID_PARAMS]: {
    message: 'Invalid parameters',
    suggestions: [
      'Check command syntax',
      'Run arka <command> --help'
    ]
  },

  [CLIErrorCode.SESSION_NOT_FOUND]: {
    message: 'Session not found',
    suggestions: [
      'List active sessions: arka session list',
      'Check session ID'
    ]
  },

  [CLIErrorCode.SESSION_CREATE_FAILED]: {
    message: 'Failed to create session',
    suggestions: [
      'Check wakeup configuration',
      'Verify agent and profile exist'
    ]
  },

  [CLIErrorCode.FILE_NOT_FOUND]: {
    message: 'File not found',
    suggestions: [
      'Check file path',
      'Use absolute or relative path'
    ]
  },

  [CLIErrorCode.FILE_TOO_LARGE]: {
    message: 'File exceeds 10MB limit',
    suggestions: [
      'Compress the file',
      'Split into smaller files'
    ]
  },

  [CLIErrorCode.MODULE_NOT_FOUND]: {
    message: 'Module not found',
    suggestions: [
      'List modules: arka status',
      'Check module ID'
    ]
  },

  [CLIErrorCode.INTERNAL_ERROR]: {
    message: 'Internal error',
    suggestions: [
      'Check logs for details',
      'Report issue if persists'
    ]
  }
}

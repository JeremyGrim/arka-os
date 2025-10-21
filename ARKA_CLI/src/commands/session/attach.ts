// src/commands/session/attach.ts

import { Command } from 'commander'
import { SocleClient } from '../../client/socle-client.js'
import { logger } from '../../utils/logger.js'
import { resolveSessionId } from '../../utils/session-resolver.js'
import chalk from 'chalk'

interface SessionLogsArgs {
  sessionId?: string
  tail?: boolean
  level?: string
}

export const sessionLogsCommand = new Command('logs')
  .description('View or stream logs for a session')
  .argument('[session-id]', 'Session ID')
  .option('--tail', 'Stream logs in real-time', true)
  .option('--level <level>', 'Filter by level (debug|info|warn|error)')
  .action(async (sessionId: string | undefined, options: SessionLogsArgs) => {
    try {
      await sessionLogs(sessionId, options)
    } catch (error) {
      logger.error('Session logs failed:', error as Error)
      process.exit(1)
    }
  })

export async function sessionLogs(sessionId: string | undefined, options: SessionLogsArgs): Promise<void> {
  const client = new SocleClient()

  const targetSessionId = await resolveSessionId(client, {
    sessionId,
    requireActive: false
  })

  const logOptions = {
    session: targetSessionId,
    level: options.level
  }

  if (options.tail) {
    logger.info(`Streaming logs for session ${targetSessionId} (Ctrl+C to stop)\n`)
    await client.streamLogs(logOptions, (log) => {
      const timestamp = new Date(log.timestamp).toLocaleTimeString()
      const level = formatLogLevel(log.level)
      const source = chalk.dim(`[${log.source}]`)
      console.log(`${timestamp} ${level} ${source} ${log.message}`)
    })
  } else {
    const logs = await client.getLogs({ ...logOptions, limit: 100 })
    logs.forEach((log) => {
      const timestamp = new Date(log.timestamp).toLocaleTimeString()
      const level = formatLogLevel(log.level)
      const source = chalk.dim(`[${log.source}]`)
      console.log(`${timestamp} ${level} ${source} ${log.message}`)
    })

    logger.info(`Displayed latest ${logs.length} entries for session ${targetSessionId}`)
  }
}

function formatLogLevel(level: string): string {
  switch (level) {
    case 'debug': return chalk.gray('[DEBUG]')
    case 'info': return chalk.blue('[INFO] ')
    case 'warn': return chalk.yellow('[WARN] ')
    case 'error': return chalk.red('[ERROR]')
    default: return `[${level}]`
  }
}


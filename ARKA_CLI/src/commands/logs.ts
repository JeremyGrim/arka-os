// src/commands/logs.ts

import { Command } from 'commander'
import { SocleClient } from '../client/socle-client.js'
import { logger } from '../utils/logger.js'
import { formatLogLevel } from '../utils/formatter.js'
import { LogsCommandOptions } from '../types/index.js'
import chalk from 'chalk'

export const logsCommand = new Command('logs')
  .description('View system logs')
  .option('--tail', 'Stream logs in real-time')
  .option('--session <id>', 'Filter by session')
  .option('--level <level>', 'Filter by level (debug|info|warn|error)')
  .action(async (options: LogsCommandOptions) => {
    try {
      await logs(options)
    } catch (error) {
      logger.error('Logs failed:', error as Error)
      process.exit(1)
    }
  })

async function logs(options: LogsCommandOptions): Promise<void> {
  const client = new SocleClient()

  if (options.tail) {
    logger.info('Streaming logs... (Ctrl+C to stop)\n')

    await client.streamLogs(
      { session: options.session, level: options.level },
      (log) => {
        const timestamp = new Date(log.timestamp).toLocaleTimeString()
        const level = formatLogLevel(log.level)
        const source = chalk.dim(`[${log.source}]`)
        console.log(`${timestamp} ${level} ${source} ${log.message}`)
      }
    )
  } else {
    const logsData = await client.getLogs({
      session: options.session,
      level: options.level,
      limit: 50
    })

    logsData.forEach((log) => {
      const timestamp = new Date(log.timestamp).toLocaleTimeString()
      const level = formatLogLevel(log.level)
      const source = chalk.dim(`[${log.source}]`)
      console.log(`${timestamp} ${level} ${source} ${log.message}`)
    })

    console.log(chalk.dim('\nShowing last 50 events. Use --tail to stream.\n'))
  }
}

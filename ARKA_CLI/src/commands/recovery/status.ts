// src/commands/recovery/status.ts

import { Command } from 'commander'
import { SocleClient } from '../../client/socle-client.js'
import { logger } from '../../utils/logger.js'
import chalk from 'chalk'

export const recoveryStatusCommand = new Command('status')
  .description('Display recovery system status')
  .option('--json', 'Output raw JSON')
  .action(async (options: { json?: boolean }) => {
    try {
      await showRecoveryStatus(options)
    } catch (error) {
      logger.error('Recovery status failed:', error as Error)
      process.exit(1)
    }
  })

async function showRecoveryStatus(options: { json?: boolean }): Promise<void> {
  const client = new SocleClient()
  const status = await client.getRecoveryStatus()

  if (options.json) {
    console.log(JSON.stringify(status, null, 2))
    return
  }

  console.log(`\nIn progress: ${status.inProgress ? chalk.yellow('yes') : chalk.green('no')}`)
  if (status.lastRun) {
    console.log(`Last run: ${status.lastRun}`)
  }

  if (!status.strategies || status.strategies.length === 0) {
    logger.warn('No recovery strategies configured')
    return
  }

  console.log(`\n${chalk.bold('STRATEGIES')}`)
  status.strategies.forEach((strategy) => {
    console.log(`  ${chalk.bold(strategy.moduleId)} :: ${strategy.status} (attempts: ${strategy.attempts})`)
    if (strategy.lastAttempt) {
      console.log(`    last attempt: ${strategy.lastAttempt}`)
    }
    if (strategy.strategy) {
      console.log(`    strategy: ${strategy.strategy}`)
    }
  })
  console.log()
}

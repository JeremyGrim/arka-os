// src/commands/recovery/trigger.ts

import { Command } from 'commander'
import { SocleClient } from '../../client/socle-client.js'
import { logger } from '../../utils/logger.js'

interface RecoveryTriggerOptions {
  module?: string
  strategy?: string
}

export const recoveryTriggerCommand = new Command('trigger')
  .description('Trigger recovery workflow')
  .option('--module <id>', 'Target specific module')
  .option('--strategy <name>', 'Override strategy (restart|reload|replace|manual|backoff)')
  .action(async (options: RecoveryTriggerOptions) => {
    try {
      await triggerRecovery(options)
    } catch (error) {
      logger.error('Recovery trigger failed:', error as Error)
      process.exit(1)
    }
  })

async function triggerRecovery(options: RecoveryTriggerOptions): Promise<void> {
  const client = new SocleClient()

  await client.triggerRecovery({
    moduleId: options.module,
    strategy: options.strategy
  })

  logger.success('Recovery process triggered')
}

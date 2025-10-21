// src/commands/module/enable.ts

import { Command } from 'commander'
import { SocleClient } from '../../client/socle-client.js'
import { logger } from '../../utils/logger.js'

export const moduleEnableCommand = new Command('enable')
  .description('Enable a SOCLE module')
  .argument('<module-id>', 'Module identifier')
  .action(async (moduleId: string) => {
    try {
      await enableModule(moduleId)
    } catch (error) {
      logger.error('Module enable failed:', error as Error)
      process.exit(1)
    }
  })

async function enableModule(moduleId: string): Promise<void> {
  const client = new SocleClient()

  await client.enableModule(moduleId)

  logger.success(`Module ${moduleId} enabled`)
}

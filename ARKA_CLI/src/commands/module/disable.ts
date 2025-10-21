// src/commands/module/disable.ts

import { Command } from 'commander'
import { SocleClient } from '../../client/socle-client.js'
import { logger } from '../../utils/logger.js'

export const moduleDisableCommand = new Command('disable')
  .description('Disable a SOCLE module')
  .argument('<module-id>', 'Module identifier')
  .action(async (moduleId: string) => {
    try {
      await disableModule(moduleId)
    } catch (error) {
      logger.error('Module disable failed:', error as Error)
      process.exit(1)
    }
  })

async function disableModule(moduleId: string): Promise<void> {
  const client = new SocleClient()

  await client.disableModule(moduleId)

  logger.success(`Module ${moduleId} disabled`)
}

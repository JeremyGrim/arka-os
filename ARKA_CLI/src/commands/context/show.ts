// src/commands/context/show.ts

import { Command } from 'commander'
import { SocleClient } from '../../client/socle-client.js'
import { logger } from '../../utils/logger.js'
import { formatContext } from '../../utils/formatter.js'

export const contextShowCommand = new Command('show')
  .description('Show current context')
  .action(async () => {
    try {
      await contextShow()
    } catch (error) {
      logger.error('Context show failed:', error as Error)
      process.exit(1)
    }
  })

async function contextShow(): Promise<void> {
  const client = new SocleClient()

  const context = await client.getContext()

  console.log(formatContext(context))
}

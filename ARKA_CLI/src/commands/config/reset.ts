// src/commands/config/reset.ts

import { Command } from 'commander'
import { SocleClient } from '../../client/socle-client.js'
import { logger } from '../../utils/logger.js'

export const configResetCommand = new Command('reset')
  .description('Reset configuration values to defaults')
  .argument('[keys...]', 'Specific keys to reset (all if omitted)')
  .action(async (keys: string[]) => {
    try {
      await resetConfig(keys || [])
    } catch (error) {
      logger.error('Config reset failed:', error as Error)
      process.exit(1)
    }
  })

async function resetConfig(keys: string[]): Promise<void> {
  const client = new SocleClient()

  await client.resetConfig(keys)

  if (keys.length > 0) {
    logger.success(`Configuration keys reset: ${keys.join(', ')}`)
  } else {
    logger.success('Configuration reset to defaults')
  }
}

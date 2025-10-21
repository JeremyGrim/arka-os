// src/commands/config/set.ts

import { Command } from 'commander'
import { SocleClient } from '../../client/socle-client.js'
import { logger } from '../../utils/logger.js'

export const configSetCommand = new Command('set')
  .description('Set configuration value')
  .argument('<key>', 'Config key')
  .argument('<value>', 'Config value')
  .action(async (key: string, value: string) => {
    try {
      await configSet(key, value)
    } catch (error) {
      logger.error('Config set failed:', error as Error)
      process.exit(1)
    }
  })

async function configSet(key: string, value: string): Promise<void> {
  const client = new SocleClient()

  // Parse value
  let parsedValue: any = value
  if (value === 'true') parsedValue = true
  else if (value === 'false') parsedValue = false
  else if (!isNaN(Number(value))) parsedValue = Number(value)

  await client.setConfig(key, parsedValue)

  logger.success(`Config updated: ${key} = ${parsedValue}`)
}

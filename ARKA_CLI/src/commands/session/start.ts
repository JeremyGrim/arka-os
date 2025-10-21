// src/commands/session/start.ts

import { Command } from 'commander'
import { SocleClient } from '../../client/socle-client.js'
import { logger } from '../../utils/logger.js'
import { SessionCreateOptions } from '../../types/index.js'
import path from 'path'
import fs from 'fs-extra'

export const sessionCreateCommand = new Command('create')
  .description('Start a new agent session')
  .requiredOption('--agent <id>', 'Agent ID')
  .requiredOption('--profile <profile>', 'Expert profile')
  .requiredOption('--provider <provider>', 'LLM provider')
  .option('--project <name>', 'Project name')
  .option('--terminal <n>', 'Terminal number (1-4)', parseInt)
  .option('--simulate', 'Simulation mode')
  .action(async (options: SessionCreateOptions) => {
    try {
      await createSession(options)
    } catch (error) {
      logger.error('Session start failed:', error as Error)
      process.exit(1)
    }
  })

export async function createSession(options: SessionCreateOptions): Promise<void> {
  const client = new SocleClient()

  logger.info('Starting session...')

  // Create wakeup config
  const wakeupConfig = {
    agentId: options.agent,
    profile: options.profile,
    provider: options.provider,
    project: options.project || await getCurrentProject(),
    simulate: options.simulate || false
  }

  // Validate config
  logger.info('Validating configuration...')
  await client.validateWakeupConfig(wakeupConfig)

  // Create session
  logger.info('Creating session...')
  const session = await client.createSession(wakeupConfig)

  // Assign terminal
  if (options.terminal) {
    logger.info(`Assigning to terminal ${options.terminal}...`)
    await client.assignTerminal(session.id, options.terminal)
  }

  // Success
  logger.success('Session created successfully!')
  console.log(`\n  ID:       ${session.id}`)
  console.log(`  Agent:    ${session.agentId} (${session.profile})`)
  console.log(`  Provider: ${session.provider}`)
  console.log(`  Terminal: ${session.terminalId || 'parked'}`)
  console.log(`  Status:   ${session.status}\n`)

  // Suggest attach
  if (session.terminalId) {
    logger.info(`Run 'arka session attach ${session.id}' to see logs`)
  }
}

async function getCurrentProject(): Promise<string> {
  // Read from .ARKA_LABS/core/socle.yaml or use cwd
  try {
    const socleYaml = path.join(process.cwd(), '.ARKA_LABS/core/socle.yaml')
    if (await fs.pathExists(socleYaml)) {
      const content = await fs.readFile(socleYaml, 'utf-8')
      const match = content.match(/name:\s*"([^"]+)"/)
      if (match) {
        return match[1]
      }
    }
  } catch (error) {
    // Ignore
  }
  return 'default'
}






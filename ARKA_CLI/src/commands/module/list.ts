// src/commands/module/list.ts

import { Command } from 'commander'
import { SocleClient } from '../../client/socle-client.js'
import { logger } from '../../utils/logger.js'
import chalk from 'chalk'

export const moduleListCommand = new Command('list')
  .description('List SOCLE modules')
  .option('--json', 'Output as JSON')
  .action(async (options: { json?: boolean }) => {
    try {
      await listModules(options)
    } catch (error) {
      logger.error('Module list failed:', error as Error)
      process.exit(1)
    }
  })

async function listModules(options: { json?: boolean }): Promise<void> {
  const client = new SocleClient()
  const modules = await client.listModules()

  if (options.json) {
    console.log(JSON.stringify(modules, null, 2))
    return
  }

  if (modules.length === 0) {
    logger.warn('No modules registered in SOCLE')
    return
  }

  const header = chalk.bold(`${pad('ID', 18)} ${pad('STATUS', 10)} ${pad('VERSION', 10)} ${pad('PRIORITY', 8)} ENABLED`)
  console.log(`\n${header}`)
  modules.forEach((module) => {
    const statusColor = module.status === 'ready' ? chalk.green : module.status === 'degraded' ? chalk.yellow : chalk.red
    const enabled = module.enabled ? chalk.green('yes') : chalk.red('no')
    console.log(`${pad(module.id, 18)} ${pad(statusColor(module.status), 10)} ${pad(module.version, 10)} ${pad(String(module.priority), 8)} ${enabled}`)
  })
  console.log()
}

function pad(value: string, length: number): string {
  const ansiRegex = /\u001b\[[0-9;]*m/g
  const plain = value.replace(ansiRegex, '')
  if (plain.length >= length) {
    return value
  }
  return value + ' '.repeat(length - plain.length)
}

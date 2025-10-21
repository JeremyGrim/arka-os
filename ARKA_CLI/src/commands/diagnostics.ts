// src/commands/diagnostics.ts

import { Command } from 'commander'
import { SocleClient } from '../client/socle-client.js'
import { logger } from '../utils/logger.js'
import chalk from 'chalk'

export const diagnosticsCommand = new Command('diagnostics')
  .description('Run SOCLE diagnostics')
  .option('--json', 'Output raw diagnostic report')
  .action(async (options: { json?: boolean }) => {
    try {
      await runDiagnostics(options)
    } catch (error) {
      logger.error('Diagnostics failed:', error as Error)
      process.exit(1)
    }
  })

async function runDiagnostics(options: { json?: boolean }): Promise<void> {
  const client = new SocleClient()
  const report = await client.getDiagnostics()

  if (options.json) {
    console.log(JSON.stringify(report, null, 2))
    return
  }

  const statusColor = report.health === 'pass' ? chalk.green : report.health === 'warn' ? chalk.yellow : chalk.red
  console.log(`${chalk.bold('Diagnostics')} :: ${statusColor(report.health)} @ ${report.timestamp}`)
  console.log(report.summary)

  if (report.checks && report.checks.length > 0) {
    console.log(`\n${chalk.bold('CHECKS')}`)
    report.checks.forEach((check) => {
      const checkColor = check.status === 'pass' ? chalk.green : check.status === 'warn' ? chalk.yellow : chalk.red
      console.log(`  ${checkColor(check.status.padEnd(5))} ${check.component}`)
      if (check.details && check.details.length > 0) {
        check.details.forEach((detail) => console.log(`    - ${detail}`))
      }
    })
  }
}

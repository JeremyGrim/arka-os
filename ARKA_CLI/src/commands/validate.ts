// src/commands/validate.ts

import { Command } from 'commander'
import { SocleClient } from '../client/socle-client.js'
import { logger } from '../utils/logger.js'
import chalk from 'chalk'

export const validateCommand = new Command('validate')
  .description('Validate SOCLE configuration and environment')
  .option('--json', 'Output raw validation report')
  .action(async (options: { json?: boolean }) => {
    try {
      await runValidation(options)
    } catch (error) {
      logger.error('Validation failed:', error as Error)
      process.exit(1)
    }
  })

async function runValidation(options: { json?: boolean }): Promise<void> {
  const client = new SocleClient()

  const report = await client.validateConfiguration()

  if (options.json) {
    console.log(JSON.stringify(report, null, 2))
    return
  }

  if (report.valid) {
    logger.success('Configuration validated successfully')
  } else {
    logger.warn('Configuration contains errors')
  }

  if (report.errors && report.errors.length > 0) {
    console.log(`\n${chalk.red.bold('Errors')}`)
    report.errors.forEach((error) => {
      console.log(`  ${chalk.red('✖')} ${formatIssue(error)}`)
    })
  }

  if (report.warnings && report.warnings.length > 0) {
    console.log(`\n${chalk.yellow.bold('Warnings')}`)
    report.warnings.forEach((warning) => {
      console.log(`  ${chalk.yellow('!')} ${formatIssue(warning)}`)
    })
  }

  console.log(`\nChecked at: ${report.checkedAt}`)
}

function formatIssue(issue: any): string {
  const parts = [issue.code, issue.message]
  if (issue.path) {
    parts.push(`path=${issue.path}`)
  }
  if (issue.hint) {
    parts.push(`hint=${issue.hint}`)
  }
  return parts.filter(Boolean).join(' :: ')
}

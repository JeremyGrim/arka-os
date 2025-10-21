// src/commands/report.ts

import { Command } from 'commander'
import { SocleClient } from '../client/socle-client.js'
import { logger } from '../utils/logger.js'
import fs from 'fs-extra'
import path from 'path'

interface ReportOptions {
  output?: string
  json?: boolean
}

export const reportCommand = new Command('report')
  .description('Generate SOCLE state report')
  .option('--output <file>', 'Write report to file (JSON)')
  .option('--json', 'Print JSON to stdout')
  .action(async (options: ReportOptions) => {
    try {
      await generateReport(options)
    } catch (error) {
      logger.error('Report generation failed:', error as Error)
      process.exit(1)
    }
  })

async function generateReport(options: ReportOptions): Promise<void> {
  const client = new SocleClient()
  const report = await client.generateReport()

  const payload = JSON.stringify(report, null, 2)

  if (options.output) {
    const absolute = path.resolve(options.output)
    await fs.ensureDir(path.dirname(absolute))
    await fs.writeFile(absolute, payload, 'utf-8')
    logger.success(`Report saved to ${absolute}`)
    return
  }

  if (options.json) {
    console.log(payload)
    return
  }

  logger.success('Report generated')
  console.log(`Environment: ${report.environment}`)
  console.log(`Generated at: ${report.generatedAt}`)
  console.log(`Modules: ${report.modules.length}`)
  console.log(`Sessions: ${report.sessions.length}`)
}

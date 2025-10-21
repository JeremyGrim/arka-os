// src/commands/context/pull.ts

import { Command } from 'commander'
import { SocleClient } from '../../client/socle-client.js'
import { logger } from '../../utils/logger.js'
import fs from 'fs-extra'
import path from 'path'
import YAML from 'yaml'

interface ContextPullOptions {
  output?: string
  format?: 'json' | 'yaml'
  json?: boolean
}

export const contextPullCommand = new Command('pull')
  .description('Retrieve current context from SOCLE')
  .option('--output <file>', 'Write context to file')
  .option('--format <format>', 'Output format: json|yaml', 'json')
  .option('--json', 'Shorthand for --format json')
  .action(async (options: ContextPullOptions) => {
    try {
      await pullContext(options)
    } catch (error) {
      logger.error('Context pull failed:', error as Error)
      process.exit(1)
    }
  })

export async function pullContext(options: ContextPullOptions): Promise<void> {
  const client = new SocleClient()
  const context = await client.getContext()

  const format = options.json ? 'json' : options.format ?? 'json'

  if (options.output) {
    const absolute = path.resolve(options.output)
    await fs.ensureDir(path.dirname(absolute))
    await fs.writeFile(absolute, serialize(context, format), 'utf-8')
    logger.success(`Context saved to ${absolute}`)
  } else {
    console.log(serialize(context, format))
  }
}

function serialize(context: any, format: 'json' | 'yaml'): string {
  if (format === 'yaml') {
    return YAML.stringify(context)
  }

  return JSON.stringify(context, null, 2)
}


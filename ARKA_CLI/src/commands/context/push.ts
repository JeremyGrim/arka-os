// src/commands/context/push.ts

import { Command } from 'commander'
import { SocleClient } from '../../client/socle-client.js'
import { logger } from '../../utils/logger.js'
import path from 'path'
import fs from 'fs-extra'
import YAML from 'yaml'

interface ContextPushOptions {
  file?: string
}

export const contextPushCommand = new Command('push')
  .description('Push local context information to SOCLE')
  .option('--file <path>', 'Context file (json or yaml)')
  .action(async (options: ContextPushOptions) => {
    try {
      await pushContext(options)
    } catch (error) {
      logger.error('Context push failed:', error as Error)
      process.exit(1)
    }
  })

export async function pushContext(options: ContextPushOptions): Promise<void> {
  const client = new SocleClient()
  const filePath = await resolveContextFile(options.file)

  logger.info(`Reading context from ${filePath}`)

  const raw = await fs.readFile(filePath, 'utf-8')
  const payload = parseContextPayload(filePath, raw)

  const result = await client.pushContext(payload)

  logger.success('Context synchronised with SOCLE')
  logger.info(`New version: ${result.version}`)
}

async function resolveContextFile(candidate?: string): Promise<string> {
  if (candidate) {
    const absolute = path.resolve(candidate)
    if (!(await fs.pathExists(absolute))) {
      throw new Error(`Context file ${absolute} not found`)
    }
    return absolute
  }

  const defaultPath = path.join(process.cwd(), '.ARKA_LABS', 'context.json')
  const defaultYaml = path.join(process.cwd(), '.ARKA_LABS', 'context.yaml')

  if (await fs.pathExists(defaultPath)) {
    return defaultPath
  }
  if (await fs.pathExists(defaultYaml)) {
    return defaultYaml
  }

  throw new Error('No context file found. Provide --file <path>.')
}

function parseContextPayload(filePath: string, contents: string): any {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.yaml' || ext === '.yml') {
    return YAML.parse(contents)
  }

  return JSON.parse(contents)
}


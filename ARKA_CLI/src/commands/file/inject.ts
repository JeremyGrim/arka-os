// src/commands/file/inject.ts

import { Command } from 'commander'
import { SocleClient } from '../../client/socle-client.js'
import { logger } from '../../utils/logger.js'
import { resolveSessionId } from '../../utils/session-resolver.js'
import { validateFile } from '../../utils/validator.js'
import { formatSize } from '../../utils/formatter.js'
import { FileInjectOptions } from '../../types/index.js'
import fs from 'fs-extra'
import path from 'path'
import { v4 as uuid } from 'uuid'

export const fileInjectCommand = new Command('inject')
  .description('Inject a file into ARKA_META')
  .argument('<path>', 'File path')
  .option('--session <id>', 'Session ID')
  .option('--type <type>', 'File type: input|output', 'input')
  .option('--tags <tags>', 'Tags (comma-separated)')
  .action(async (filePath: string, options: FileInjectOptions) => {
    try {
      await fileInject(filePath, options)
    } catch (error) {
      logger.error('File inject failed:', error as Error)
      process.exit(1)
    }
  })

export async function fileInject(
  filePath: string,
  options: FileInjectOptions
): Promise<void> {
  const client = new SocleClient()

  // Validate file
  logger.info('Reading file...')
  await validateFile(filePath)

  const absolutePath = path.resolve(filePath)
  const content = await fs.readFile(absolutePath, 'utf-8')
  const stats = await fs.stat(absolutePath)

  // Create MetaFile
  const metaFile = {
    id: uuid(),
    sessionId: await resolveSessionId(client, { sessionId: options.session }),
    name: path.basename(filePath),
    type: options.type,
    content,
    createdAt: new Date(),
    updatedAt: new Date(),
    path: absolutePath,
    tags: options.tags ? options.tags.split(',').map(t => t.trim()) : [],
    size: stats.size,
    metadata: {
      originalPath: filePath
    }
  }

  // Inject
  logger.info('Saving to ARKA_META...')
  await client.saveFile(metaFile)

  // Success
  logger.success('File injected successfully!')
  console.log(`\n  ID:      ${metaFile.id}`)
  console.log(`  Name:    ${metaFile.name}`)
  console.log(`  Type:    ${metaFile.type}`)
  console.log(`  Size:    ${formatSize(metaFile.size)}`)
  console.log(`  Session: ${metaFile.sessionId}`)
  if (metaFile.tags.length > 0) {
    console.log(`  Tags:    ${metaFile.tags.join(', ')}`)
  }
  console.log()
}

async function getCurrentSession(): Promise<string> {
  // Get current session or use 'default'
  return 'default'
}


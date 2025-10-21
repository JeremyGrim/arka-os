// src/commands/file/list.ts

import { Command } from 'commander'
import { SocleClient } from '../../client/socle-client.js'
import { logger } from '../../utils/logger.js'
import { formatFileList } from '../../utils/formatter.js'
import { FileListOptions } from '../../types/index.js'

export const fileListCommand = new Command('list')
  .description('List files in ARKA_META')
  .option('--session <id>', 'Filter by session')
  .option('--type <type>', 'Filter by type')
  .option('--json', 'Output as JSON')
  .action(async (options: FileListOptions) => {
    try {
      await fileList(options)
    } catch (error) {
      logger.error('File list failed:', error as Error)
      process.exit(1)
    }
  })

async function fileList(options: FileListOptions): Promise<void> {
  const client = new SocleClient()

  const filter: any = {}
  if (options.session) filter.sessionId = options.session
  if (options.type) filter.type = options.type

  const files = await client.listFiles(filter)

  if (options.json) {
    console.log(JSON.stringify(files, null, 2))
  } else {
    console.log(formatFileList(files))
  }
}

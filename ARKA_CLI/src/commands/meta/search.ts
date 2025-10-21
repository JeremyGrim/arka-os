// src/commands/meta/search.ts

import { Command } from 'commander'
import { SocleClient } from '../../client/socle-client.js'
import { logger } from '../../utils/logger.js'
import { formatSearchResults } from '../../utils/formatter.js'

export const metaSearchCommand = new Command('search')
  .description('Search files by tags')
  .argument('<query>', 'Search query (tags)')
  .option('--json', 'Output as JSON')
  .action(async (query: string, options: any) => {
    try {
      await metaSearch(query, options)
    } catch (error) {
      logger.error('Search failed:', error as Error)
      process.exit(1)
    }
  })

async function metaSearch(query: string, options: any): Promise<void> {
  const client = new SocleClient()

  logger.info(`Searching for: ${query}`)

  // Search by tags (Partie 1: tag search only)
  const results = await client.searchByTag(query)

  if (options.json) {
    console.log(JSON.stringify(results, null, 2))
  } else {
    console.log(formatSearchResults(results, query))
  }
}

// src/commands/init.ts

import { Command } from 'commander'
import { SocleClient } from '../client/socle-client.js'
import { logger } from '../utils/logger.js'
import { validatePath } from '../utils/validator.js'
import { InitOptions } from '../types/index.js'
import fs from 'fs-extra'
import path from 'path'

export const initCommand = new Command('init')
  .description('Initialize ARKA_LABS in current directory')
  .option('--path <path>', 'Project path', '.')
  .option('--force', 'Force reinit if exists')
  .option('--template <name>', 'Config template', 'default')
  .action(async (options) => {
    try {
      await init(options)
    } catch (error) {
      logger.error('Init failed:', error as Error)
      process.exit(1)
    }
  })

export async function init(options: InitOptions): Promise<void> {
  const projectPath = path.resolve(options.path)
  const socleDir = path.join(projectPath, '.ARKA_LABS')

  // 1. Check if already initialized
  if (await fs.pathExists(socleDir) && !options.force) {
    throw new Error('SOCLE already initialized. Use --force to reinit.')
  }

  logger.info('Initializing ARKA_LABS...')

  // 2. Validate path
  await validatePath(projectPath)

  // 3. Create structure
  logger.info('Creating directory structure...')
  await createSocleStructure(socleDir, options.template)

  // 4. Connect to SOCLE and load modules
  logger.info('Connecting to SOCLE...')
  const client = new SocleClient()

  try {
    await client.connect()
    await client.loadCoreModules()
  } catch (error) {
    logger.warn('Could not connect to SOCLE. Run manually after init.')
  }

  // 5. Success
  logger.success('ARKA_LABS initialized successfully!')
  logger.info(`Path: ${projectPath}`)
  logger.info(`Run 'arka status' to check system.`)
}

async function createSocleStructure(
  socleDir: string,
  template: string
): Promise<void> {
  // Create directories
  await fs.ensureDir(path.join(socleDir, 'core'))
  await fs.ensureDir(path.join(socleDir, 'core/adapters'))
  await fs.ensureDir(path.join(socleDir, 'core/logs'))
  await fs.ensureDir(path.join(socleDir, 'ARKA_META/inputs'))
  await fs.ensureDir(path.join(socleDir, 'ARKA_META/outputs'))
  await fs.ensureDir(path.join(socleDir, 'ARKA_META/memory'))
  await fs.ensureDir(path.join(socleDir, 'ARKA_META/sessions'))
  await fs.ensureDir(path.join(socleDir, 'ARKA_META/index'))
  await fs.ensureDir(path.join(socleDir, 'sessions'))

  // Create config
  const config = getTemplateConfig(template)
  await fs.writeFile(
    path.join(socleDir, 'core/socle.yaml'),
    config,
    'utf-8'
  )

  // Create registry
  await fs.writeJSON(
    path.join(socleDir, 'core/registry.json'),
    { version: '1.0.0', modules: [] },
    { spaces: 2 }
  )
}

function getTemplateConfig(template: string): string {
  if (template === 'minimal') {
    return `socle:
  version: "0.1-d_beta"
  name: "ARKA_LABS"
  environment: development

modules:
  - id: arka_core
    name: "ARKA Core"
    type: core
    active: true
    priority: 1
    autoStart: true

  - id: arka_os
    name: "ARKA OS"
    type: core
    active: true
    priority: 1
    autoStart: true
`
  }

  // Default template
  return `socle:
  version: "0.1-d_beta"
  name: "ARKA_LABS"
  environment: development

modules:
  - id: arka_core
    name: "ARKA Core"
    type: core
    path: ARKA_OS/ARKA_CORE/
    adapter: adapters/core_adapter.yaml
    active: true
    priority: 1
    autoStart: true

  - id: arka_os
    name: "ARKA OS"
    type: core
    path: ARKA_OS/
    adapter: adapters/os_adapter.yaml
    active: true
    priority: 1
    autoStart: true

  - id: arka_cli
    name: "ARKA CLI"
    type: local
    path: ARKA_CLI/
    adapter: adapters/cli_adapter.yaml
    active: true
    priority: 2
    autoStart: true
    dependencies:
      - arka_core
      - arka_os

  - id: arka_meta
    name: "ARKA Meta"
    type: meta
    path: ARKA_META/
    adapter: adapters/meta_adapter.yaml
    active: true
    priority: 3
    autoStart: true
    dependencies:
      - arka_core

persistence:
  saveInterval: 60000
  logRetentionDays: 7

monitoring:
  enabled: true
  healthCheckInterval: 30000
`
}


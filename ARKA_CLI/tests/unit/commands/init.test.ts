import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'

const connectMock = vi.fn()
const loadCoreModulesMock = vi.fn()

vi.mock('../../../src/client/socle-client.js', () => ({
  SocleClient: vi.fn().mockImplementation(() => ({
    connect: connectMock,
    loadCoreModules: loadCoreModulesMock
  }))
}))

vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}))

import { init } from '../../../src/commands/init.js'
import type { InitOptions } from '../../../src/types/index.js'

describe('init', () => {
  let tmpDir: string
  let projectDir: string

  beforeEach(async () => {
    connectMock.mockReset()
    loadCoreModulesMock.mockReset()
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arka-cli-init-'))
    projectDir = path.join(tmpDir, 'project')
  })

  afterEach(async () => {
    await fs.remove(tmpDir)
  })

  it('creates SOCLE structure and loads core modules', async () => {
    const options: InitOptions = {
      path: projectDir,
      force: false,
      template: 'minimal'
    }

    await init(options)

    const socleDir = path.join(projectDir, '.ARKA_LABS')
    await expect(fs.pathExists(path.join(socleDir, 'core'))).resolves.toBe(true)
    await expect(fs.pathExists(path.join(socleDir, 'ARKA_META/inputs'))).resolves.toBe(true)
    await expect(fs.pathExists(path.join(socleDir, 'core/socle.yaml'))).resolves.toBe(true)
    await expect(fs.pathExists(path.join(socleDir, 'core/registry.json'))).resolves.toBe(true)

    expect(connectMock).toHaveBeenCalled()
    expect(loadCoreModulesMock).toHaveBeenCalled()
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs-extra'
import path from 'path'
import os from 'os'

const pushContextMock = vi.fn()
const getContextMock = vi.fn()

vi.mock('../../src/client/socle-client.js', () => ({
  SocleClient: vi.fn().mockImplementation(() => ({
    pushContext: pushContextMock,
    getContext: getContextMock
  }))
}))

vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}))

import { pushContext } from '../../src/commands/context/push.js'
import { pullContext } from '../../src/commands/context/pull.js'

describe('context synchronization', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arka-context-'))
    pushContextMock.mockReset()
    pushContextMock.mockResolvedValue({ version: 5 })
    getContextMock.mockReset()
  })

  afterEach(async () => {
    await fs.remove(tmpDir)
  })

  it('pushes context from YAML file', async () => {
    const filePath = path.join(tmpDir, 'context.yaml')
    await fs.writeFile(filePath, 'version: 4\nproject:\n  id: PRJ-1\n', 'utf-8')

    await pushContext({ file: filePath })

    expect(pushContextMock).toHaveBeenCalledWith({
      version: 4,
      project: { id: 'PRJ-1' }
    })
  })

  it('pulls context and writes to file in yaml format', async () => {
    const output = path.join(tmpDir, 'out.yaml')
    getContextMock.mockResolvedValue({
      version: 5,
      user: { id: 'USR', name: 'User', role: 'agp' }
    })

    await pullContext({ output, format: 'yaml' })

    const written = await fs.readFile(output, 'utf-8')
    expect(written).toContain('version: 5')
    expect(written).toContain('id: USR')
  })
})

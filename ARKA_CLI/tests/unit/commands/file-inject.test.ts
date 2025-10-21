import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'

const mocks = vi.hoisted(() => ({
  saveFileMock: vi.fn(),
  resolveSessionIdMock: vi.fn()
}))

vi.mock('../../../src/client/socle-client.js', () => ({
  SocleClient: vi.fn().mockImplementation(() => ({
    saveFile: mocks.saveFileMock
  }))
}))

vi.mock('../../../src/utils/session-resolver.js', () => ({
  resolveSessionId: mocks.resolveSessionIdMock
}))

vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}))

import { fileInject } from '../../../src/commands/file/inject.js'
import type { FileInjectOptions } from '../../../src/types/index.js'

describe('fileInject', () => {
  let tmpDir: string
  let filePath: string

  beforeEach(async () => {
    mocks.saveFileMock.mockReset()
    mocks.resolveSessionIdMock.mockReset()
    mocks.resolveSessionIdMock.mockResolvedValue('session-123')

    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arka-cli-test-'))
    filePath = path.join(tmpDir, 'payload.txt')
    await fs.writeFile(filePath, 'hello world', 'utf-8')
  })

  afterEach(async () => {
    await fs.remove(tmpDir)
  })

  it('saves file to SOCLE with resolved session', async () => {
    const options: FileInjectOptions = { type: 'input' }

    await fileInject(filePath, options)

    expect(mocks.resolveSessionIdMock).toHaveBeenCalledWith(expect.anything(), {
      sessionId: undefined
    })

    expect(mocks.saveFileMock).toHaveBeenCalledTimes(1)
    const payload = mocks.saveFileMock.mock.calls[0][0]
    expect(payload.sessionId).toBe('session-123')
    expect(payload.name).toBe('payload.txt')
    expect(payload.type).toBe('input')
    expect(payload.content).toBe('hello world')
    expect(payload.size).toBeGreaterThan(0)
  })

  it('passes explicit session to resolver', async () => {
    const options: FileInjectOptions = { type: 'output', session: 'custom-session' }

    await fileInject(filePath, options)

    expect(mocks.resolveSessionIdMock).toHaveBeenCalledWith(expect.anything(), {
      sessionId: 'custom-session'
    })
  })
})

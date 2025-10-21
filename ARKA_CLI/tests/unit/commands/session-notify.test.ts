import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import YAML from 'yaml'
import { CLIError } from '../../../src/utils/errors.js'

const mocks = vi.hoisted(() => {
  const notifySessionMock = vi.fn()
  const socleConstructor = vi.fn().mockImplementation(() => ({
    notifySession: notifySessionMock
  }))

  const logger = {
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }

  return {
    notifySessionMock,
    socleConstructor,
    logger
  }
})

vi.mock('../../../src/client/socle-client.js', () => ({
  SocleClient: mocks.socleConstructor
}))

vi.mock('../../../src/utils/logger.js', () => ({
  logger: mocks.logger
}))

import { runSessionNotify } from '../../../src/commands/session/notify.js'

describe('session notify command', () => {
  let tmpDir: string
  let cwdSpy: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    mocks.notifySessionMock.mockReset()
    mocks.socleConstructor.mockClear()
    Object.values(mocks.logger).forEach((fn) => fn.mockReset?.())

    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arka-cli-notify-'))
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)
  })

  afterEach(async () => {
    cwdSpy.mockRestore()
    await fs.remove(tmpDir)
  })

  it('resolves notification with dry-run without touching roster or network', async () => {
    await runSessionNotify({
      agent: 'lead-dev-batisseur',
      text: 'ping',
      dryRun: true
    })

    expect(mocks.socleConstructor).not.toHaveBeenCalled()
    expect(mocks.logger.warn).toHaveBeenCalledWith(expect.stringMatching(/dry-run/i))

    const rosterPath = path.join(tmpDir, 'ARKA_META', '.system', 'coordination', 'ROSTER.yaml')
    expect(await fs.pathExists(rosterPath)).toBe(false)
  })

  it('creates a temporary alias, sends notification and persists roster', async () => {
    mocks.notifySessionMock.mockResolvedValue(undefined)

    await runSessionNotify({
      agent: 'lead-dev-batisseur',
      text: 'réveil'
    })

    expect(mocks.socleConstructor).toHaveBeenCalledTimes(1)
    expect(mocks.notifySessionMock).toHaveBeenCalledTimes(1)

    const [sessionId, payloadText] = mocks.notifySessionMock.mock.calls[0]
    expect(sessionId).toMatch(/^temp_ulid_[0-9a-z]+$/)
    expect(payloadText).toBe('réveil')

    const rosterPath = path.join(tmpDir, 'ARKA_META', '.system', 'coordination', 'ROSTER.yaml')
    const yamlContent = await fs.readFile(rosterPath, 'utf-8')
    const roster = YAML.parse(yamlContent)
    const agent = roster.agents.find((entry: any) => entry.agent_id === 'lead-dev-batisseur')

    expect(agent).toBeDefined()
    expect(agent.active).toBe(true)
    expect(agent.session_id).toBeNull()
    expect(agent.proposed_session_id).toBe(sessionId)
    expect(typeof agent.updated_at).toBe('string')

    expect(mocks.logger.success).toHaveBeenCalledWith(expect.stringMatching(/Notification envoyée/))
  })

  it('updates roster with explicit session id', async () => {
    mocks.notifySessionMock.mockResolvedValue(undefined)

    await runSessionNotify({
      agent: 'pmo',
      text: 'reprendre la main',
      session: 'codex-session-007'
    })

    const [sessionId, payloadText] = mocks.notifySessionMock.mock.calls[0]
    expect(sessionId).toBe('codex-session-007')
    expect(payloadText).toBe('reprendre la main')

    const rosterPath = path.join(tmpDir, 'ARKA_META', '.system', 'coordination', 'ROSTER.yaml')
    const yamlContent = await fs.readFile(rosterPath, 'utf-8')
    const agent = YAML.parse(yamlContent).agents.find((entry: any) => entry.agent_id === 'pmo')

    expect(agent.session_id).toBe('codex-session-007')
    expect(agent.proposed_session_id).toBeNull()
  })

  it('rejects messages longer than the allowed limit', async () => {
    const longText = 'a'.repeat(300)
    await expect(runSessionNotify({
      agent: 'lead-dev-batisseur',
      text: longText
    })).rejects.toBeInstanceOf(CLIError)
  })
})

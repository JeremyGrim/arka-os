import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import http from 'http'
import YAML from 'yaml'
import { runSessionNotify } from '../../src/commands/session/notify.js'

interface CapturedRequest {
  url: string
  body: any
}

describe('session notify integration', () => {
  let tmpDir: string
  let cwdSpy: ReturnType<typeof vi.spyOn>
  let server: http.Server | null
  let port: number
  let serverReady = true
  const requests: CapturedRequest[] = []
  const originalSocleUrl = process.env.ARKA_SOCLE_URL

  beforeEach(async () => {
    requests.length = 0
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arka-cli-notify-int-'))
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)

    serverReady = true
    server = http.createServer(async (req, res) => {
      if (req.method === 'POST' && req.url?.startsWith('/api/sessions/') && req.url.endsWith('/notify')) {
        const body = await readJsonBody(req)
        requests.push({ url: req.url, body })
        res.writeHead(202, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ status: 'queued', sessionId: body?.sessionId ?? null, payload: body }))
        return
      }

      res.writeHead(404).end()
    })
    try {
      await new Promise<void>((resolve, reject) => {
        server?.listen(0, '127.0.0.1', () => {
          const address = server?.address()
          if (address && typeof address === 'object') {
            port = address.port
            resolve()
          } else {
            reject(new Error('Failed to capture server port'))
          }
        })
        server?.on('error', reject)
      })
      process.env.ARKA_SOCLE_URL = `http://127.0.0.1:${port}`
    } catch (error: any) {
      if (error?.code === 'EPERM') {
        serverReady = false
      } else {
        throw error
      }
    }
  })

  afterEach(async () => {
    cwdSpy.mockRestore()
    await fs.remove(tmpDir)

    if (server?.listening) {
      await new Promise<void>((resolve) => {
        server?.close(() => resolve())
      })
    }
    server = null

    if (originalSocleUrl === undefined) {
      delete process.env.ARKA_SOCLE_URL
    } else {
      process.env.ARKA_SOCLE_URL = originalSocleUrl
    }
  })

  it('sends the notification to SOCLE and persists roster alias', async () => {
    if (!serverReady) {
      console.warn('session notify integration skipped: listen not permitted in sandbox')
      return
    }

    await runSessionNotify({
      agent: 'lead-dev-batisseur',
      text: 'ping integration'
    })

    expect(requests.length).toBe(1)
    const [request] = requests
    const sessionId = extractSessionId(request.url)
    expect(sessionId).toMatch(/^temp_ulid_[0-9a-z]+$/)
    expect(request.body).toMatchObject({ text: 'ping integration' })

    const rosterPath = path.join(tmpDir, 'ARKA_META', '.system', 'coordination', 'ROSTER.yaml')
    const content = await fs.readFile(rosterPath, 'utf-8')
    const roster = YAML.parse(content)
    const agentEntry = roster.agents.find((agent: any) => agent.agent_id === 'lead-dev-batisseur')

    expect(agentEntry).toBeDefined()
    expect(agentEntry.session_id).toBeNull()
    expect(agentEntry.proposed_session_id).toBe(sessionId)
    expect(typeof agentEntry.updated_at).toBe('string')
  })
})

function extractSessionId(url: string): string {
  const segments = url.split('/')
  if (segments.length < 4) {
    throw new Error(`Unexpected notify URL: ${url}`)
  }
  return segments[3]
}

function readJsonBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk))
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf-8') || '{}'
        resolve(JSON.parse(raw))
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

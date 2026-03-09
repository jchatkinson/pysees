export const AGENT_PORTS = [8765, 8766, 8767, 8768] as const

export type AgentConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

export type AgentServerEvent =
  | { type: 'job_started'; jobId: string }
  | { type: 'point'; jobId: string; i: number; eps: number; sig: number }
  | { type: 'job_log'; jobId: string; stream: 'stdout' | 'stderr'; line: string }
  | { type: 'job_finished'; jobId: string; pointCount: number; elapsedMs: number }
  | { type: 'job_error'; jobId: string; code: string; message: string }
  | { type: 'pong'; ts: number }

export interface MaterialRunRequest {
  jobId: string
  materialCall: { fn: 'uniaxialMaterial'; args: (string | number | boolean | null)[] }
  protocol: { strain: number[] }
  ndm: number
  ndf: number
}

interface SessionResponse {
  sessionToken: string
  expiresAt: string
}

interface HealthResponse {
  name: string
  version: string
}

export class LocalAgentClient {
  private ws: WebSocket | null = null
  private port: number | null = null
  private eventHandler: ((event: AgentServerEvent) => void) | null = null
  private closeHandler: (() => void) | null = null

  onEvent(cb: ((event: AgentServerEvent) => void) | null) {
    this.eventHandler = cb
  }

  onClose(cb: (() => void) | null) {
    this.closeHandler = cb
  }

  get connectedPort() {
    return this.port
  }

  isConnected() {
    return this.ws?.readyState === WebSocket.OPEN
  }

  disconnect() {
    if (this.ws) this.ws.close()
    this.ws = null
    this.port = null
  }

  async connect() {
    if (this.isConnected() && this.port !== null) return this.port
    this.disconnect()

    const errors: string[] = []
    for (const port of AGENT_PORTS) {
      try {
        const health = await this.healthCheck(port)
        if (health.name !== 'pysees-agent') {
          errors.push(`Port ${port}: unexpected service ${health.name}`)
          continue
        }
        const session = await this.createSession(port)
        await this.openWs(port, session.sessionToken)
        this.port = port
        return port
      } catch (err) {
        errors.push(`Port ${port}: ${String(err)}`)
      }
    }

    throw new Error(errors.length ? errors.join(' | ') : 'No local agent found')
  }

  runMaterial(request: MaterialRunRequest) {
    this.send({ type: 'run_material', ...request })
  }

  cancelJob(jobId: string) {
    this.send({ type: 'cancel_job', jobId })
  }

  private send(payload: object) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error('Local agent is not connected')
    this.ws.send(JSON.stringify(payload))
  }

  private async healthCheck(port: number) {
    const response = await fetchWithTimeout(`http://127.0.0.1:${port}/health`, { method: 'GET' }, 1200)
    if (!response.ok) throw new Error(`health status ${response.status}`)
    return response.json() as Promise<HealthResponse>
  }

  private async createSession(port: number) {
    const response = await fetchWithTimeout(`http://127.0.0.1:${port}/v1/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client: 'pysees-web' }),
    }, 1500)
    if (!response.ok) throw new Error(`session status ${response.status}`)
    return response.json() as Promise<SessionResponse>
  }

  private openWs(port: number, token: string) {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/v1/ws?token=${encodeURIComponent(token)}`)
      let opened = false

      ws.onopen = () => {
        opened = true
        this.ws = ws
        resolve()
      }
      ws.onerror = () => {
        if (!opened) reject(new Error('websocket open failed'))
      }
      ws.onclose = () => {
        this.ws = null
        this.port = null
        if (this.closeHandler) this.closeHandler()
      }
      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(String(event.data)) as AgentServerEvent
          if (this.eventHandler) this.eventHandler(parsed)
        } catch {
          // ignore malformed events
        }
      }
    })
  }
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

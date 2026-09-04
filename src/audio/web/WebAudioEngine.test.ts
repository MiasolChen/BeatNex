import { afterEach, describe, expect, it, vi } from 'vitest'

import type { DrumKit } from '../types'
import { WebAudioEngine } from './WebAudioEngine'

class FakeAudioParam {
  value = 1
  setTargetAtTime() {}
}

class FakeGain {
  gain = new FakeAudioParam()
  connect() { return this }
}

class FakeAudioContext {
  currentTime = 0
  destination = {}
  state: AudioContextState = 'running'
  async resume() {}
  async close() { this.state = 'closed' }
  createGain() { return new FakeGain() }
  async decodeAudioData() { return {} }
}

const kit: DrumKit = {
  kick: '/kick.wav', snare: '/snare.wav',
  closedHat: '/closed-hat.wav', openHat: '/open-hat.wav',
}

describe('WebAudioEngine loading', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('exposes a failed asset and can retry the full kit', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext)
    let shouldFail = true
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (shouldFail && url.includes('kick')) return { ok: false, status: 404 }
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) }
    }))
    const engine = new WebAudioEngine()

    await expect(engine.prepare(kit)).rejects.toThrow('kick 加载失败')
    expect(engine.getSnapshot()).toMatchObject({ status: 'error', error: 'kick 加载失败（HTTP 404）' })

    shouldFail = false
    await expect(engine.prepare(kit)).resolves.toBeUndefined()
    expect(engine.getSnapshot().status).toBe('ready')
    engine.dispose()
  })
})

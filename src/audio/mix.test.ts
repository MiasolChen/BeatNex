import { describe, expect, it } from 'vitest'

import { DRUM_IDS, type DrumId } from '../core/pattern/types'
import type { TrackMix, TrainingMix } from './types'
import { resolveDrumGains } from './mix'

const mixes = (overrides: Partial<Record<DrumId, Partial<TrackMix>>> = {}) => new Map(
  DRUM_IDS.map((drum) => [drum, {
    muted: false,
    solo: false,
    focused: false,
    volume: 1,
    ...overrides[drum],
  } satisfies TrackMix]),
)

const gains = (trainingMix?: TrainingMix, overrides: Partial<Record<DrumId, Partial<TrackMix>>> = {}) =>
  resolveDrumGains(mixes(overrides), trainingMix)

describe('resolveDrumGains', () => {
  it('maps full and manual arrangement switches to each drum volume', () => {
    expect(gains(undefined, {
      kick: { volume: 0.8 },
      snare: { muted: true, volume: 0.7 },
      closedHat: { focused: true, volume: 0.6 },
      openHat: { volume: 0.5 },
    })).toEqual({ kick: 0.8 * 0.18, snare: 0, closedHat: 0.6, openHat: 0.5 * 0.18 })
  })

  const trainingCases: Array<[string, TrainingMix, Record<DrumId, number>]> = [
    ['solo', { mode: 'solo', targets: ['kick', 'closedHat'] }, { kick: 1, snare: 0, closedHat: 1, openHat: 0 }],
    ['weaken', { mode: 'weaken', targets: ['kick', 'closedHat'] }, { kick: 0.18, snare: 1, closedHat: 0.18, openHat: 1 }],
    ['focus', { mode: 'focus', targets: ['kick', 'closedHat'] }, { kick: 1, snare: 0.18, closedHat: 1, openHat: 0.18 }],
    ['mute-target', { mode: 'mute-target', targets: ['kick', 'closedHat'] }, { kick: 0, snare: 1, closedHat: 0, openHat: 1 }],
  ]

  it.each(trainingCases)('maps the %s training mode across selected targets', (_name, trainingMix, expected) => {
    expect(gains(trainingMix)).toEqual(expected)
  })

  it('honors mute and solo precedence and supports the legacy single target', () => {
    expect(gains({ mode: 'solo', target: 'kick' }, {
      kick: { solo: true, volume: 0.8 },
      snare: { solo: true, volume: 0.6 },
      closedHat: { muted: true },
    })).toEqual({ kick: 0.8, snare: 0, closedHat: 0, openHat: 0 })
    expect(gains({ mode: 'mute-target', target: 'snare' }, { snare: { volume: 0.7 } })).toEqual({
      kick: 1, snare: 0, closedHat: 1, openHat: 1,
    })
  })

  it('treats an explicitly empty target list as empty', () => {
    expect(gains({ mode: 'solo', targets: [], target: 'kick' })).toEqual({ kick: 0, snare: 0, closedHat: 0, openHat: 0 })
    expect(gains({ mode: 'weaken', targets: [], target: 'kick' })).toEqual({ kick: 1, snare: 1, closedHat: 1, openHat: 1 })
  })
})

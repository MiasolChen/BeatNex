import { type Difficulty, type DrumId, type Pattern } from './types'
import { validatePattern } from './validate'

const velocityByMark: Record<string, number> = { X: 100, x: 65, g: 35 }

function track(drum: DrumId, notation: string) {
  return {
    drum,
    hits: [...notation].flatMap((mark, step) =>
      mark === '-' ? [] : [{ step, velocity: velocityByMark[mark] }],
    ),
  }
}

function pattern(
  slug: string,
  name: string,
  difficulty: Difficulty,
  bpm: number,
  notation: Record<DrumId, string>,
): Pattern {
  const value: Pattern = {
    schemaVersion: 1,
    id: `boom-bap-${slug}-${difficulty}`,
    name,
    style: 'boom-bap',
    difficulty,
    bars: 1,
    beatsPerBar: 4,
    subdivision: 4,
    recommendedBpm: bpm,
    tracks: [
      track('kick', notation.kick),
      track('snare', notation.snare),
      track('closedHat', notation.closedHat),
      track('openHat', notation.openHat),
    ],
  }
  validatePattern(value)
  return value
}

export const BOOM_BAP_PATTERNS = [
  pattern('foundation', 'Foundation Backbeat', 'simple', 88, {
    kick: 'X---X---X---X---', snare: '----X-------X---',
    closedHat: 'x-x-x-x-x-x-x-x-', openHat: '----------------',
  }),
  pattern('foundation', 'Foundation Backbeat', 'hard', 88, {
    kick: 'X-----x-X-x---x-', snare: '----X-------X--g',
    closedHat: 'x-x-x-x-x-x-x-x-', openHat: '--------------x-',
  }),
  pattern('pocket-swing', 'Pocket Swing', 'simple', 92, {
    kick: 'X-----x-X-x-----', snare: '----X-------X---',
    closedHat: 'x-x-x-x-x-x-x-x-', openHat: '----------------',
  }),
  pattern('pocket-swing', 'Pocket Swing', 'hard', 92, {
    kick: 'X--x--x-X-x---x-', snare: '----X--g----X--g',
    closedHat: 'x-xxx-x-x-xxx-x-', openHat: '--------------x-',
  }),
  pattern('syncopated-break', 'Syncopated Break', 'simple', 96, {
    kick: 'X--x----X-x---x-', snare: '----X-------X---',
    closedHat: 'x-x-x-x-x-x-x---', openHat: '--------------x-',
  }),
  pattern('syncopated-break', 'Syncopated Break', 'hard', 96, {
    kick: 'X--x--x---x-x--x', snare: '----X-g-----X--g',
    closedHat: 'x-xxx-x-x---x-x-', openHat: '----------x-----',
  }),
  pattern('foundation', 'Foundation Backbeat', 'medium', 88, {
    kick: 'X-----x-X---x---', snare: '----X-------X---',
    closedHat: 'x-x-x-x-x-x-x-x-', openHat: '----------------',
  }),
  pattern('pocket-swing', 'Pocket Swing', 'medium', 92, {
    kick: 'X-----x-X-x---x-', snare: '----X--g----X---',
    closedHat: 'x-x-x-x-x-xxx-x-', openHat: '----------------',
  }),
  pattern('syncopated-break', 'Syncopated Break', 'medium', 96, {
    kick: 'X--x--x-X-x---x-', snare: '----X-------X--g',
    closedHat: 'x-x-x-x-x-x-x---', openHat: '--------------x-',
  }),
  pattern('kick-conversation', 'Kick Conversation', 'simple', 90, {
    kick: 'X-----x-X-------', snare: '----X-------X---',
    closedHat: 'x-x-x-x-x-x-x-x-', openHat: '----------------',
  }),
  pattern('kick-conversation', 'Kick Conversation', 'medium', 90, {
    kick: 'X-----x-X--x----', snare: '----X-------X---',
    closedHat: 'x-x-x-x-x-x-x-x-', openHat: '----------------',
  }),
  pattern('kick-conversation', 'Kick Conversation', 'hard', 90, {
    kick: 'X--x--x-X--x--x-', snare: '----X-------X--g',
    closedHat: 'x-x-x-x-x-x-x-x-', openHat: '--------------x-',
  }),
  pattern('ghost-backbeat', 'Ghost Backbeat', 'simple', 86, {
    kick: 'X-------X-------', snare: '----X-----g-X---',
    closedHat: 'x-x-x-x-x-x-x-x-', openHat: '----------------',
  }),
  pattern('ghost-backbeat', 'Ghost Backbeat', 'medium', 86, {
    kick: 'X-----x-X-------', snare: '---gX-----g-X---',
    closedHat: 'x-x-x-x-x-x-x-x-', openHat: '----------------',
  }),
  pattern('ghost-backbeat', 'Ghost Backbeat', 'hard', 86, {
    kick: 'X-----x-X--x----', snare: '--ggX--g--g-X--g',
    closedHat: 'x-x-x-x-x-x-x-x-', openHat: '----------------',
  }),
  pattern('hat-accents', 'Hat Accents', 'simple', 90, {
    kick: 'X-------X-------', snare: '----X-------X---',
    closedHat: 'X-x-X-x-X-x-X-x-', openHat: '----------------',
  }),
  pattern('hat-accents', 'Hat Accents', 'medium', 90, {
    kick: 'X-----x-X-------', snare: '----X-------X---',
    closedHat: 'X-xxX-x-X-xxX-x-', openHat: '----------------',
  }),
  pattern('hat-accents', 'Hat Accents', 'hard', 90, {
    kick: 'X-----x-X--x----', snare: '----X-------X---',
    closedHat: 'XgxxXgxgXgxxXgxg', openHat: '----------------',
  }),
  pattern('open-hat-release', 'Open Hat Release', 'simple', 92, {
    kick: 'X-------X-------', snare: '----X-------X---',
    closedHat: 'x-x-x-x-x-x-x---', openHat: '--------------x-',
  }),
  pattern('open-hat-release', 'Open Hat Release', 'medium', 92, {
    kick: 'X-----x-X-------', snare: '----X-------X---',
    closedHat: 'x-x-x---x-x-x---', openHat: '------x-------x-',
  }),
  pattern('open-hat-release', 'Open Hat Release', 'hard', 92, {
    kick: 'X--x--x-X-x---x-', snare: '----X-------X--g',
    closedHat: 'x-xxx---x-xxx---', openHat: '------x-------x-',
  }),
  pattern('silence-return', 'Silence Return', 'simple', 88, {
    kick: 'X-------X-------', snare: '----X-------X---',
    closedHat: 'x-x-x-x-x-x-----', openHat: '----------------',
  }),
  pattern('silence-return', 'Silence Return', 'medium', 88, {
    kick: 'X-----x-X-------', snare: '----X-------X---',
    closedHat: 'x-x-x-x-x-------', openHat: '----------------',
  }),
  pattern('silence-return', 'Silence Return', 'hard', 88, {
    kick: 'X--x--x-X-------', snare: '----X-g---------',
    closedHat: 'x-xxx-x-x-------', openHat: '----------------',
  }),
] satisfies Pattern[]

export const PATTERN_NAMES = [...new Set(BOOM_BAP_PATTERNS.map(({ name }) => name))]

export function findPattern(name: string, difficulty: Difficulty) {
  return BOOM_BAP_PATTERNS.find((item) => item.name === name && item.difficulty === difficulty)
    ?? BOOM_BAP_PATTERNS[0]
}

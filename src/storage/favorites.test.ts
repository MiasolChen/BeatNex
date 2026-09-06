import { describe, expect, it } from 'vitest'
import { FAVORITES_KEY, readFavorites, writeFavorites } from './favorites'

describe('favorites', () => {
  it('persists stable content IDs instead of library positions', () => {
    const data = new Map<string, string>()
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) } }
    expect(readFavorites(storage)).toEqual({ value: [], error: null })
    expect(writeFavorites(['boom-bap-foundation', 'mix-abc'], storage).ok).toBe(true)
    expect(readFavorites(storage).value).toEqual(['boom-bap-foundation', 'mix-abc'])
    expect(writeFavorites(['same', 'same'], storage).ok).toBe(false)
    expect(readFavorites(storage).value).toEqual(['boom-bap-foundation', 'mix-abc'])
    data.set(FAVORITES_KEY, '[0,1]')
    expect(readFavorites(storage).error).toBeTruthy()
    expect(writeFavorites([], storage).ok).toBe(false)
    expect(data.get(FAVORITES_KEY)).toBe('[0,1]')
  })
})

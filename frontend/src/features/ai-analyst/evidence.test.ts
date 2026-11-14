import { describe, expect, it } from 'vitest'

import { classifyNumber } from './evidence'

describe('AI number ↔ evidence linking', () => {
  const evidence = [62.534, 41, 100, 47.1]
  it('links numbers that match evidence at their own precision', () => {
    expect(classifyNumber('62.5', evidence, [])).toBe('evidence')
    expect(classifyNumber('62.53', evidence, [])).toBe('evidence')
    expect(classifyNumber('41', evidence, [])).toBe('evidence')
  })
  it('flags backend-reported unsupported numbers and ignores small counts', () => {
    expect(classifyNumber('87.2', evidence, ['87.2'])).toBe('unsupported')
    expect(classifyNumber('2', evidence, [])).toBe('plain')
    expect(classifyNumber('63.9', evidence, [])).toBe('plain')
  })
})

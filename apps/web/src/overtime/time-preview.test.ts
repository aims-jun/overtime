import { describe, expect, it } from 'vitest'
import { formatMinutes } from './time-preview'

describe('formatMinutes', () => {
  it.each([
    [0, '0시간'],
    [30, '30분'],
    [60, '1시간'],
    [90, '1시간 30분'],
  ])('formats %i minutes as %s', (minutes, expected) => {
    expect(formatMinutes(minutes)).toBe(expected)
  })
})

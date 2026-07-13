import { describe, expect, it } from 'vitest'
import { buildCsvUrl } from './csv-download'

describe('buildCsvUrl', () => {
  it('keeps active month and user filters', () => {
    expect(buildCsvUrl({ month: '2026-07', userId: 'user-1' })).toBe(
      '/api/admin/reports.csv?month=2026-07&userId=user-1',
    )
  })

  it('omits an empty user filter', () => {
    expect(buildCsvUrl({ month: '2026-07' })).toBe(
      '/api/admin/reports.csv?month=2026-07',
    )
  })
})

import { describe, expect, it } from 'vitest'
import { buildExcelUrl } from './excel-download'

describe('buildExcelUrl', () => {
  it('keeps active month and user filters', () => {
    expect(buildExcelUrl({ month: '2026-07', userId: 'user-1' })).toBe(
      '/api/admin/reports.xlsx?month=2026-07&userId=user-1',
    )
  })

  it('omits an empty user filter', () => {
    expect(buildExcelUrl({ month: '2026-07' })).toBe(
      '/api/admin/reports.xlsx?month=2026-07',
    )
  })
})

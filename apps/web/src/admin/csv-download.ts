export function buildCsvUrl(query: { month: string; userId?: string }): string {
  const params = new URLSearchParams({ month: query.month })
  if (query.userId) params.set('userId', query.userId)
  return `/api/admin/reports.csv?${params.toString()}`
}

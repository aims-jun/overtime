export function buildExcelUrl(query: { month: string; userId?: string }): string {
  const params = new URLSearchParams({ month: query.month })
  if (query.userId) params.set('userId', query.userId)
  return `/api/admin/reports.xlsx?${params.toString()}`
}

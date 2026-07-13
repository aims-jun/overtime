export type TimePreview = {
  durationMinutes: number
  crossesMidnight: boolean
  valid: boolean
}

function minutes(time: string): number | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null
  const [hour, minute] = time.split(':').map(Number)
  return hour * 60 + minute
}

export function previewTime(startTime: string, endTime: string): TimePreview {
  const start = minutes(startTime)
  const end = minutes(endTime)
  if (start === null || end === null) {
    return { durationMinutes: 0, crossesMidnight: false, valid: false }
  }
  const crossesMidnight = end <= start
  const durationMinutes = end + (crossesMidnight ? 24 * 60 : 0) - start
  return {
    durationMinutes,
    crossesMidnight,
    valid: durationMinutes > 0 && durationMinutes <= 16 * 60,
  }
}

export function formatMinutes(value: number): string {
  if (value === 0) return '0시간'
  const hours = Math.floor(value / 60)
  const minutes = value % 60
  if (hours === 0) return `${minutes}분`
  return minutes === 0 ? `${hours}시간` : `${hours}시간 ${minutes}분`
}

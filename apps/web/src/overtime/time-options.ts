export const THIRTY_MINUTE_TIME_OPTIONS = Array.from(
  { length: 48 },
  (_, index) => {
    const hours = Math.floor(index / 2).toString().padStart(2, '0')
    const minutes = index % 2 === 0 ? '00' : '30'
    return `${hours}:${minutes}`
  },
)

export type User = {
  id: string
  email: string
  name: string
  pictureUrl: string | null
  role: 'EMPLOYEE' | 'ADMIN'
}

export type OvertimeRecord = {
  id: string
  workDate: string
  startTime: string
  endTime: string
  durationMinutes: number
  reason: string
  createdAt: string
  updatedAt: string
}

export type MonthlyOvertime = {
  month: string
  totalMinutes: number
  records: OvertimeRecord[]
}

export type OvertimeFormValues = {
  workDate: string
  startTime: string
  endTime: string
  reason: string
}

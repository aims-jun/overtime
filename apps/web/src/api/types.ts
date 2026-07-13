export type User = {
  id: string
  email: string
  name: string
  isAdmin: boolean
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

export type AdminUser = { id: string; name: string; email: string }

export type AdminOvertimeRecord = {
  id: string
  user: AdminUser
  workDate: string
  startTime: string
  endTime: string
  durationMinutes: number
  reason: string
}

export type AdminReport = {
  month: string
  userId?: string
  totalMinutes: number
  totalsByUser: Array<{ user: AdminUser; totalMinutes: number }>
  records: AdminOvertimeRecord[]
}

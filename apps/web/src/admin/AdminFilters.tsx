import type { AdminUser } from '../api/types'
import { MonthPicker } from '../ui/MonthPicker'

type Props = {
  month: string
  userId?: string
  users: AdminUser[]
  onChange: (filters: { month: string; userId?: string }) => void
}

export function AdminFilters({ month, userId, users, onChange }: Props) {
  return (
    <section className="admin-filters" aria-label="보고서 필터">
      <div className="field admin-month-field">
        <span>조회 월</span>
        <MonthPicker
          label="조회 월"
          value={month}
          onChange={(nextMonth) => onChange({ month: nextMonth, userId })}
        />
      </div>
      <label className="field">
        <span>직원</span>
        <select
          value={userId ?? ''}
          onChange={(event) =>
            onChange({ month, userId: event.target.value || undefined })
          }
        >
          <option value="">전체 직원</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>{user.name} · {user.email}</option>
          ))}
        </select>
      </label>
    </section>
  )
}

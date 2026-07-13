import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, friendlyError } from '../api/http'
import type { MonthlyOvertime, OvertimeRecord } from '../api/types'
import { formatMinutes } from './time-preview'
import { OvertimeForm } from './OvertimeForm'
import { OvertimeList } from './OvertimeList'

function currentMonth(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date())
}

export function OvertimePage() {
  const [month, setMonth] = useState(currentMonth)
  const [editing, setEditing] = useState<OvertimeRecord | null>(null)
  const [deletingId, setDeletingId] = useState('')
  const [actionError, setActionError] = useState('')
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['overtime', month],
    queryFn: () => api<MonthlyOvertime>(`/api/overtime?month=${month}`),
    retry: false,
  })

  const refresh = async () => {
    setEditing(null)
    await queryClient.invalidateQueries({ queryKey: ['overtime'] })
  }

  const remove = async (record: OvertimeRecord) => {
    if (!window.confirm(`${record.workDate} 야근 기록을 삭제할까요?`)) return
    setDeletingId(record.id)
    setActionError('')
    try {
      await api<void>(`/api/overtime/${record.id}`, { method: 'DELETE' })
      if (editing?.id === record.id) setEditing(null)
      await queryClient.invalidateQueries({ queryKey: ['overtime'] })
    } catch (error) {
      setActionError(friendlyError(error))
    } finally {
      setDeletingId('')
    }
  }

  return (
    <main className="page-shell">
      <section className="summary-panel">
        <div>
          <span className="eyebrow">나의 기록</span>
          <h1>야근 기록</h1>
          <p>늦게까지 애쓴 시간을 잊지 않도록 간단히 남겨요.</p>
        </div>
        <div className="monthly-total" aria-label="선택한 달 야근 합계">
          <span>{month.slice(5)}월 합계</span>
          <strong>총 {formatMinutes(query.data?.totalMinutes ?? 0)}</strong>
        </div>
      </section>

      <section className="surface form-surface">
        <OvertimeForm
          record={editing}
          onSaved={refresh}
          onCancel={() => setEditing(null)}
        />
      </section>

      <section className="history-section">
        <div className="history-heading">
          <div>
            <span className="eyebrow">기록 내역</span>
            <h2>이번 달 기록</h2>
          </div>
          <label className="month-picker">
            <span className="sr-only">조회 월</span>
            <input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            />
          </label>
        </div>

        {query.isPending ? <div className="status-card">기록을 불러오는 중…</div> : null}
        {query.isError ? (
          <div className="status-card error-card" role="alert">
            <p>{friendlyError(query.error)}</p>
            <button type="button" onClick={() => query.refetch()}>다시 불러오기</button>
          </div>
        ) : null}
        {actionError ? <p className="form-error" role="alert">{actionError}</p> : null}
        {query.data ? (
          <OvertimeList
            records={query.data.records}
            deletingId={deletingId}
            onEdit={(record) => {
              setEditing(record)
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
            onDelete={remove}
          />
        ) : null}
      </section>
    </main>
  )
}

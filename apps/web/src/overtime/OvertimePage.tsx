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

function monthName(value: string): string {
  const [year, month] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    timeZone: 'UTC',
  })
    .format(new Date(Date.UTC(year, month - 1, 1)))
    .toUpperCase()
}

export function OvertimePage() {
  const [month, setMonth] = useState(currentMonth)
  const [editing, setEditing] = useState<OvertimeRecord | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
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
    setEditorOpen(false)
    await queryClient.invalidateQueries({ queryKey: ['overtime'] })
  }

  const remove = async (record: OvertimeRecord) => {
    if (!window.confirm(`${record.workDate} 업무 연장 내역을 삭제할까요?`)) return
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
        <div className="summary-copy">
          <span className="eyebrow">
            WORK LOG · {monthName(query.data?.month ?? month)}
          </span>
          <h1>업무 연장 내역</h1>
          <p>AIMS의 추가 근무 시간을 간편하게 기록하고 확인하세요.</p>
        </div>
        <div className="monthly-total" aria-label="선택한 달 업무 연장 합계">
          <span>{month.slice(5)}월 업무 연장</span>
          <strong>{formatMinutes(query.data?.totalMinutes ?? 0)}</strong>
          <small>TOTAL EXTENDED</small>
        </div>
      </section>

      <button
        className="add-record-button"
        type="button"
        aria-expanded={editorOpen}
        aria-controls="work-time-editor"
        onClick={() => {
          setEditing(null)
          setEditorOpen(true)
        }}
      >
        + 업무 시간 추가
      </button>

      {editorOpen ? (
        <section className="surface form-surface" id="work-time-editor">
          <OvertimeForm
            record={editing}
            onSaved={refresh}
            onCancel={() => {
              setEditing(null)
              setEditorOpen(false)
            }}
          />
        </section>
      ) : null}

      <section className="history-section">
        <div className="history-heading">
          <div>
            <span className="eyebrow">WORK LOG</span>
            <h2>최근 내역</h2>
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
              setEditorOpen(true)
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
            onDelete={remove}
          />
        ) : null}
      </section>
    </main>
  )
}

import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, friendlyError } from '../api/http'
import type { MonthlyOvertime, OvertimeRecord } from '../api/types'
import { Dialog } from '../ui/Dialog'
import { Icon } from '../ui/Icon'
import { OvertimeEditorDialog } from './OvertimeEditorDialog'
import { formatMinutes } from './time-preview'
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
  const [editorOpen, setEditorOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<OvertimeRecord | null>(null)
  const [deletingId, setDeletingId] = useState('')
  const [actionError, setActionError] = useState('')
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['overtime', month],
    queryFn: () => api<MonthlyOvertime>(`/api/overtime?month=${month}`),
    placeholderData: keepPreviousData,
    retry: false,
  })
  const displayedMonth = query.data?.month ?? month

  const refresh = async () => {
    setEditing(null)
    setEditorOpen(false)
    await queryClient.invalidateQueries({ queryKey: ['overtime'] })
  }

  const remove = async (record: OvertimeRecord) => {
    setDeletingId(record.id)
    setActionError('')
    try {
      await api<void>(`/api/overtime/${record.id}`, { method: 'DELETE' })
      if (editing?.id === record.id) setEditing(null)
      await queryClient.invalidateQueries({ queryKey: ['overtime'] })
      setPendingDelete(null)
    } catch (error) {
      setActionError(friendlyError(error))
    } finally {
      setDeletingId('')
    }
  }

  return (
    <main className="page-shell">
      <section className="summary-panel">
        <div className="summary-heading">
          <span className="eyebrow">
            AIMS · {Number(displayedMonth.slice(5))}월
          </span>
          <h1>업무 연장 내역</h1>
        </div>
        <div className="monthly-total" aria-label="선택한 달 업무 연장 합계">
          <span>{Number(displayedMonth.slice(5))}월 업무 연장</span>
          <strong>{formatMinutes(query.data?.totalMinutes ?? 0)}</strong>
        </div>
      </section>

      <button
        className="add-record-button"
        type="button"
        aria-expanded={editorOpen}
        onClick={() => {
          setEditing(null)
          setEditorOpen(true)
        }}
      >
        <Icon name="plus" />
        추가 근무 등록
      </button>

      <OvertimeEditorDialog
        open={editorOpen}
        record={editing}
        onSaved={refresh}
        onClose={() => {
          setEditing(null)
          setEditorOpen(false)
        }}
      />

      <section className="history-section">
        <div className="history-heading">
          <div>
            <span className="eyebrow">업무 기록</span>
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

        {query.isPending ? (
          <div className="status-skeleton" role="status" aria-label="불러오는 중">
            <span /><span /><span />
          </div>
        ) : null}
        {query.isFetching && !query.isPending ? (
          <p className="refresh-status" role="status" aria-label="다른 달 내역을 불러오는 중">
            내역을 새로 불러오는 중…
          </p>
        ) : null}
        {query.isError ? (
          <div className="status-card error-card" role="alert">
            <p>{friendlyError(query.error)}</p>
            <button type="button" onClick={() => query.refetch()}>다시 불러오기</button>
          </div>
        ) : null}
        {query.data ? (
          <OvertimeList
            records={query.data.records}
            deletingId={deletingId}
            onAdd={() => {
              setEditing(null)
              setEditorOpen(true)
            }}
            onEdit={(record) => {
              setEditing(record)
              setEditorOpen(true)
            }}
            onDelete={(record) => {
              setActionError('')
              setPendingDelete(record)
            }}
          />
        ) : null}
      </section>

      <Dialog
        open={pendingDelete !== null}
        title="내역을 삭제할까요?"
        onClose={() => setPendingDelete(null)}
        className="delete-confirm-dialog"
      >
        <div className="delete-confirm-content">
          <p>
            {pendingDelete
              ? `${pendingDelete.reason} 내역은 삭제 후 복구할 수 없습니다.`
              : null}
          </p>
          {actionError ? <p className="form-error" role="alert">{actionError}</p> : null}
          <div className="dialog-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => setPendingDelete(null)}
            >
              취소
            </button>
            <button
              className="danger-confirm-button"
              type="button"
              disabled={!pendingDelete || deletingId === pendingDelete.id}
              onClick={() => pendingDelete && remove(pendingDelete)}
            >
              {pendingDelete && deletingId === pendingDelete.id
                ? '삭제 중…'
                : '삭제하기'}
            </button>
          </div>
        </div>
      </Dialog>
    </main>
  )
}

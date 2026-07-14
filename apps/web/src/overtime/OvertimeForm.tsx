import { useEffect, useMemo, useState } from 'react'
import { api, friendlyError } from '../api/http'
import type { OvertimeFormValues, OvertimeRecord } from '../api/types'
import { THIRTY_MINUTE_TIME_OPTIONS } from './time-options'
import { formatMinutes, previewTime } from './time-preview'

type Props = {
  record?: OvertimeRecord | null
  onSaved: (record: OvertimeRecord) => void
  onCancel?: () => void
}

function today(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

const initialValues = (): OvertimeFormValues => ({
  workDate: today(),
  startTime: '18:00',
  endTime: '19:00',
  reason: '',
})

export function OvertimeForm({ record, onSaved, onCancel }: Props) {
  const [values, setValues] = useState<OvertimeFormValues>(initialValues)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const preview = useMemo(
    () => previewTime(values.startTime, values.endTime),
    [values.startTime, values.endTime],
  )

  useEffect(() => {
    if (record) {
      setValues({
        workDate: record.workDate,
        startTime: record.startTime,
        endTime: record.endTime,
        reason: record.reason,
      })
    } else {
      setValues(initialValues())
    }
    setError('')
  }, [record])

  const update = (key: keyof OvertimeFormValues, value: string) => {
    setValues((current) => ({ ...current, [key]: value }))
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!preview.valid) {
      setError('추가 근무 시간은 16시간 이내로 입력해주세요')
      return
    }
    setSaving(true)
    setError('')
    try {
      const saved = await api<OvertimeRecord>(
        record ? `/api/overtime/${record.id}` : '/api/overtime',
        {
          method: record ? 'PATCH' : 'POST',
          body: JSON.stringify(values),
        },
      )
      onSaved(saved)
      if (!record) setValues(initialValues())
    } catch (caught) {
      setError(friendlyError(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="record-form" onSubmit={submit}>
      <div className="section-heading">
        <div>
          <span className="eyebrow">{record ? 'EDIT WORK LOG' : 'NEW WORK LOG'}</span>
          <h2>{record ? '업무 연장 내역 수정' : '업무 시간 입력'}</h2>
        </div>
        {record && onCancel ? (
          <button className="text-button" type="button" onClick={onCancel}>
            취소
          </button>
        ) : null}
      </div>

      <label className="field field-wide">
        <span>근무 날짜</span>
        <input
          type="date"
          value={values.workDate}
          onChange={(event) => update('workDate', event.target.value)}
          required
        />
      </label>

      <div className="time-fields">
        <label className="field">
          <span>시작 시간</span>
          <select
            value={values.startTime}
            onChange={(event) => update('startTime', event.target.value)}
            required
          >
            {THIRTY_MINUTE_TIME_OPTIONS.map((time) => (
              <option key={time} value={time}>{time}</option>
            ))}
          </select>
        </label>
        <span className="time-arrow" aria-hidden="true">→</span>
        <label className="field">
          <span>종료 시간</span>
          <select
            value={values.endTime}
            onChange={(event) => update('endTime', event.target.value)}
            required
          >
            {THIRTY_MINUTE_TIME_OPTIONS.map((time) => (
              <option key={time} value={time}>{time}</option>
            ))}
          </select>
        </label>
      </div>

      <div className={`time-preview ${preview.valid ? '' : 'is-invalid'}`}>
        <strong>
          {preview.valid
            ? `추가 근무 시간 ${formatMinutes(preview.durationMinutes)}`
            : '시간을 확인해주세요'}
        </strong>
        {preview.crossesMidnight ? <span>종료 시간은 다음 날입니다</span> : null}
      </div>

      <label className="field field-wide">
        <span>업무 내용</span>
        <textarea
          value={values.reason}
          onChange={(event) => update('reason', event.target.value)}
          placeholder="예: 정기 배포 대응"
          maxLength={500}
          rows={3}
          required
        />
      </label>

      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button className="primary-button" type="submit" disabled={saving}>
        {saving ? '저장 중…' : record ? '수정 저장' : '저장'}
      </button>
    </form>
  )
}

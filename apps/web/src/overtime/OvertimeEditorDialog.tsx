import type { OvertimeRecord } from '../api/types'
import { Dialog } from '../ui/Dialog'
import { OvertimeForm } from './OvertimeForm'

type Props = {
  open: boolean
  record: OvertimeRecord | null
  onSaved: (record: OvertimeRecord) => void
  onClose: () => void
}

export function OvertimeEditorDialog({
  open,
  record,
  onSaved,
  onClose,
}: Props) {
  return (
    <Dialog
      open={open}
      title={record ? '추가 근무 수정' : '추가 근무 등록'}
      onClose={onClose}
      className="overtime-editor-dialog"
    >
      <OvertimeForm record={record} onSaved={onSaved} onCancel={onClose} />
    </Dialog>
  )
}

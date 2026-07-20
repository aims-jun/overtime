import type { ButtonHTMLAttributes } from 'react'
import { Icon, type IconName } from './Icon'

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> & {
  label: string
  icon: IconName
  tone?: 'danger'
}

export function IconButton({
  label,
  icon,
  tone,
  className,
  ...buttonProps
}: IconButtonProps) {
  const classes = [
    'icon-button',
    tone === 'danger' ? 'icon-button--danger' : undefined,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button {...buttonProps} aria-label={label} className={classes}>
      <Icon name={icon} />
    </button>
  )
}

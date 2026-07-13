import { useEffect, useRef } from 'react'

type GoogleAccounts = {
  id: {
    initialize: (options: {
      client_id: string
      callback: (response: { credential: string }) => void
    }) => void
    renderButton: (
      element: HTMLElement,
      options: Record<string, string | number>,
    ) => void
  }
}

declare global {
  interface Window {
    google?: { accounts: GoogleAccounts }
  }
}

type Props = {
  disabled?: boolean
  onCredential: (credential: string) => void
}

const SCRIPT_ID = 'google-identity-services'

export function GoogleSignInButton({ disabled, onCredential }: Props) {
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
    if (!clientId || disabled) return

    const render = () => {
      if (!window.google || !container.current) return
      container.current.replaceChildren()
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: ({ credential }) => onCredential(credential),
      })
      window.google.accounts.id.renderButton(container.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'pill',
        width: Math.min(container.current.clientWidth || 360, 360),
        locale: 'ko',
      })
    }

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
    if (existing) {
      if (window.google) render()
      else existing.addEventListener('load', render, { once: true })
      return () => existing.removeEventListener('load', render)
    }
    const script = document.createElement('script')
    script.id = SCRIPT_ID
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.addEventListener('load', render, { once: true })
    document.head.append(script)
    return () => script.removeEventListener('load', render)
  }, [disabled, onCredential])

  if (!import.meta.env.VITE_GOOGLE_CLIENT_ID) {
    return <p className="setup-message">Google 클라이언트 ID 설정이 필요합니다.</p>
  }
  return <div className="google-button" aria-busy={disabled} ref={container} />
}

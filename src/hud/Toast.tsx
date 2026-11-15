import { useEffect } from 'react'
import { useGame } from '../state/store'
import './toast.css'

const TOAST_MS = 4000

/** A short message (for example "Graphics lowered for speed") that hides itself. */
export function Toast() {
  const toast = useGame((state) => state.toast)

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => useGame.getState().clearToast(), TOAST_MS)
    return () => window.clearTimeout(timer)
  }, [toast])

  return (
    <div className="toast-row" role="status" aria-live="polite">
      {toast && (
        <p key={toast} className="toast glass glass--pill enter">
          {toast}
        </p>
      )}
    </div>
  )
}

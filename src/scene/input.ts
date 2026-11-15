/**
 * Keyboard state, tracked by KeyboardEvent.code so W A S D work on any
 * keyboard layout. Held keys are read every frame; single presses (E, M, V, Space, Q,
 * Esc) go to a callback.
 */
const held = new Set<string>()

export function isHeld(code: string): boolean {
  return held.has(code)
}

/** Forgets every held key, so the player stops when a panel opens. */
export function clearHeld(): void {
  held.clear()
}

/** The menus are worked with the keyboard too: there Space presses the focused button, and focus stays put. */
function inMenu(target: Element | null): boolean {
  return target?.closest?.('[data-menu]') != null
}

export function attachKeyboard(onPress: (event: KeyboardEvent) => void): () => void {
  const down = (event: KeyboardEvent) => {
    // Space is a game key (jump, float up, handbrake): it must not click
    // whichever button has focus or scroll the page. Typing a name still works.
    const target = event.target as HTMLElement | null
    const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
    if (event.code === 'Space' && !typing && !inMenu(target)) event.preventDefault()
    held.add(event.code)
    if (!event.repeat) onPress(event)
  }
  // After a click, buttons let go of focus, so a later Space or Enter doesn't press them again.
  const click = (event: MouseEvent) => {
    const button = (event.target as HTMLElement | null)?.closest('button')
    if (button && !inMenu(button)) window.setTimeout(() => button.blur(), 0)
  }
  const up = (event: KeyboardEvent) => {
    held.delete(event.code)
  }
  const blur = () => held.clear()

  window.addEventListener('keydown', down)
  window.addEventListener('keyup', up)
  window.addEventListener('blur', blur)
  document.addEventListener('click', click, true)
  return () => {
    document.removeEventListener('click', click, true)
    window.removeEventListener('keydown', down)
    window.removeEventListener('keyup', up)
    window.removeEventListener('blur', blur)
    held.clear()
  }
}

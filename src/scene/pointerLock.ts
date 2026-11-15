/**
 * Pointer lock on the game canvas. The browser may refuse a lock request
 * (it does for about a second after the player presses Esc), so every
 * request is allowed to fail quietly: the player keeps arrow-key look and
 * any click on the scene tries again.
 */
let lockElement: HTMLElement | null = null

export function setLockElement(element: HTMLElement | null): void {
  lockElement = element
}

export function isLocked(): boolean {
  return lockElement !== null && document.pointerLockElement === lockElement
}

export async function requestLock(): Promise<void> {
  if (!lockElement || isLocked()) return
  try {
    await lockElement.requestPointerLock()
  } catch {
    // Refused. The "Click to capture the mouse" hint stays up.
  }
}

export function releaseLock(): void {
  if (document.pointerLockElement) document.exitPointerLock()
}

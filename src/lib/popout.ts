// Opens the pop-out mini player (remote.html): a pinned window in the desktop
// app, or a Picture-in-Picture window in Chrome and Edge.
import { toast } from '../components/Toast'
import { isDesktop } from './desktop'

type Invoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>
const tauri = (globalThis as { __TAURI_INTERNALS__?: { invoke: Invoke } }).__TAURI_INTERNALS__

interface DocumentPiP {
  requestWindow(options: { width: number; height: number }): Promise<Window>
  window: Window | null
}
const pip = (globalThis as { documentPictureInPicture?: DocumentPiP }).documentPictureInPicture

/** Whether this browser or the app can pop the player out. */
export const canPopOut = isDesktop || !!pip

export const SIZE = { width: 360, height: 104 }

export async function popOut() {
  if (isDesktop) {
    try {
      await tauri!.invoke('toggle_mini')
    } catch {
      toast('Update Spindle to use the mini player')
    }
    return
  }
  if (!pip) return
  if (pip.window) return pip.window.close()
  const win = await pip.requestWindow(SIZE)
  win.document.title = 'Spindle mini player'
  win.document.body.style.cssText = 'margin:0;background:#0b0a10;overflow:hidden'
  const frame = win.document.createElement('iframe')
  frame.src = `${location.origin}/remote.html`
  frame.title = 'Spindle mini player'
  frame.style.cssText = 'display:block;width:100vw;height:100vh;border:0'
  win.document.body.append(frame)
}

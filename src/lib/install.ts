// "Use Spindle as an app": which phone this is, whether Spindle is already on
// the home screen, and Android's one-tap install prompt (beforeinstallprompt).
import { create } from 'zustand'

export type Platform = 'ios' | 'android' | 'other'

const ua = navigator.userAgent

export const platform: Platform =
  /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'ios' : /Android/.test(ua) ? 'android' : 'other'

/** Instagram, Facebook, Snapchat and similar open links in their own browser, which can't install apps. */
export const inAppBrowser = /Instagram|FBAN|FBAV|FB_IAB|Snapchat|Line\/|Twitter|TikTok|musical_ly|; wv\)/.test(ua)

/** Which app's browser, for the instructions. */
export const inAppName = /Instagram/.test(ua) ? 'Instagram' : /FBAN|FBAV|FB_IAB/.test(ua) ? 'Facebook' : /Snapchat/.test(ua) ? 'Snapchat' : 'this app'

/** iPhone browsers other than Safari (Chrome, Firefox, Edge on iOS). */
export const iosNotSafari = platform === 'ios' && /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)

export const isInstalled = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface InstallState {
  open: boolean
  /** Android Chrome's install prompt, when the browser offers one. */
  prompt: InstallPromptEvent | null
  installed: boolean
}

export const useInstall = create<InstallState>(() => ({ open: false, prompt: null, installed: isInstalled() }))

export const openInstallGuide = () => useInstall.setState({ open: true })
export const closeInstallGuide = () => useInstall.setState({ open: false })

/** Shows Android's own "Install Spindle?" dialog. Returns true if they installed. */
export async function installNow() {
  const p = useInstall.getState().prompt
  if (!p) return false
  await p.prompt()
  const { outcome } = await p.userChoice
  useInstall.setState({ prompt: null })
  return outcome === 'accepted'
}

addEventListener('beforeinstallprompt', (e) => {
  // Keep it for our own button instead of the browser's mini bar.
  e.preventDefault()
  useInstall.setState({ prompt: e as InstallPromptEvent })
})
addEventListener('appinstalled', () => useInstall.setState({ installed: true, prompt: null, open: false }))

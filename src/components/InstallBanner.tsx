import { Smartphone, X } from 'lucide-react'
import { useState } from 'react'
import { openInstallGuide, platform, useInstall } from '../lib/install'

const HIDE = 'spindle:install-banner-hidden'

const hiddenBefore = () => {
  try {
    return localStorage.getItem(HIDE) === '1'
  } catch {
    return false
  }
}

/** On phone Home, until Spindle is on the home screen (or they close it). */
export function InstallBanner() {
  const installed = useInstall((s) => s.installed)
  const [hidden, setHidden] = useState(hiddenBefore)
  if (installed || hidden || platform === 'other') return null
  const hide = () => {
    try {
      localStorage.setItem(HIDE, '1')
    } catch {
      /* private mode: hidden for this visit only */
    }
    setHidden(true)
  }
  return (
    <div className="ig-banner">
      <button className="ig-banner-main" onClick={openInstallGuide}>
        <span className="ig-banner-icon">
          <Smartphone size={20} />
        </span>
        <span>
          <b>Use Spindle like an app</b>
          <span>Add it to your home screen in 3 taps</span>
        </span>
      </button>
      <button className="ig-banner-x" onClick={hide} aria-label="Hide this tip">
        <X size={16} />
      </button>
    </div>
  )
}

import { AnimatePresence, motion } from 'framer-motion'
import { Check, Copy, Download, EllipsisVertical, ExternalLink, Share, SquarePlus, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { at } from '../lib/site'
import { closeInstallGuide, inAppBrowser, inAppName, installNow, iosNotSafari, platform, useInstall, type Platform } from '../lib/install'

function Step({ n, icon, children }: { n: number; icon: ReactNode; children: ReactNode }) {
  return (
    <li className="ig-step">
      <span className="ig-n">{n}</span>
      <span className="ig-text">{children}</span>
      <span className="ig-icon" aria-hidden="true">
        {icon}
      </span>
    </li>
  )
}

function IPhoneSteps() {
  return (
    <ol className="ig-steps">
      {iosNotSafari ? (
        <Step n={1} icon={<Share size={20} />}>
          Tap <b>Share</b> next to the address bar (or in the <b>⋯</b> menu).
        </Step>
      ) : (
        <Step n={1} icon={<Share size={20} />}>
          In <b>Safari</b>, tap the <b>Share</b> button at the bottom of the screen.
        </Step>
      )}
      <Step n={2} icon={<SquarePlus size={20} />}>
        Scroll down and tap <b>Add to Home Screen</b>.
      </Step>
      <Step n={3} icon={<Check size={20} />}>
        Make sure <b>Open as Web App</b> is on, then tap <b>Add</b>.
      </Step>
      <Step n={4} icon={<img src={at('brand/spindle-icon-120.png')} alt="" />}>
        Open Spindle from your home screen. It runs full screen, like any app.
      </Step>
    </ol>
  )
}

function AndroidSteps() {
  return (
    <ol className="ig-steps">
      <Step n={1} icon={<EllipsisVertical size={20} />}>
        In <b>Chrome</b>, tap the <b>⋮</b> menu at the top right.
      </Step>
      <Step n={2} icon={<Download size={20} />}>
        Tap <b>Add to Home screen</b> (or <b>Install app</b>).
      </Step>
      <Step n={3} icon={<Check size={20} />}>
        Tap <b>Install</b>.
      </Step>
      <Step n={4} icon={<img src={at('brand/spindle-icon-120.png')} alt="" />}>
        Open Spindle from your home screen or app drawer.
      </Step>
    </ol>
  )
}

/** You're in Instagram's (or another app's) built-in browser, which can't add apps. */
function OpenInBrowser({ os }: { os: Platform }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(location.origin + location.pathname)
      setCopied(true)
    } catch {
      /* not allowed here; they can use the menu instead */
    }
  }
  return (
    <div className="ig-inapp">
      <p>
        <b>First, leave {inAppName}.</b> Its built-in browser can’t add apps to your home screen.
      </p>
      <ol className="ig-steps">
        <Step n={1} icon={<EllipsisVertical size={20} />}>
          Tap <b>⋯</b> at the top right.
        </Step>
        <Step n={2} icon={<ExternalLink size={20} />}>
          Tap <b>{os === 'ios' ? 'Open in external browser' : 'Open in Chrome'}</b>
          {os === 'ios' ? ' (it opens in Safari)' : ''}, then follow the steps below.
        </Step>
      </ol>
      <button className="btn btn-ghost ig-copy" onClick={copy}>
        {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Link copied' : 'Or copy the link'}
      </button>
    </div>
  )
}

/** "Use Spindle as an app": how to add it to the home screen on iPhone and Android. */
export function InstallGuide() {
  const open = useInstall((s) => s.open)
  const prompt = useInstall((s) => s.prompt)
  const installed = useInstall((s) => s.installed)
  const [tab, setTab] = useState<'ios' | 'android'>(platform === 'android' ? 'android' : 'ios')

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="wn-scrim ig-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeInstallGuide}>
          <motion.div
            className="wn-card ig-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ig-title"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="wn-close" onClick={closeInstallGuide} aria-label="Close">
              <X size={18} />
            </button>
            <span className="wn-kicker">Get the app</span>
            <h2 id="ig-title">Use Spindle like an app</h2>
            <p className="ig-lede">Add it to your home screen: its own icon, full screen, no browser bars. Nothing to download from a store.</p>

            {installed ? (
              <p className="ig-done">
                <Check size={18} /> Spindle is already on your home screen. You’re all set.
              </p>
            ) : (
              <>
                {prompt && (
                  <button
                    className="btn btn-primary ig-install"
                    onClick={async () => {
                      if (await installNow()) closeInstallGuide()
                    }}
                  >
                    <Download size={18} /> Install Spindle
                  </button>
                )}

                {inAppBrowser && platform !== 'other' && <OpenInBrowser os={platform} />}

                <div className="seg ig-tabs" role="tablist" aria-label="Phone">
                  <button role="tab" aria-selected={tab === 'ios'} className={tab === 'ios' ? 'is-on' : ''} onClick={() => setTab('ios')}>
                    iPhone
                  </button>
                  <button role="tab" aria-selected={tab === 'android'} className={tab === 'android' ? 'is-on' : ''} onClick={() => setTab('android')}>
                    Android
                  </button>
                </div>
                {tab === 'ios' ? <IPhoneSteps /> : <AndroidSteps />}
              </>
            )}
            <button className="btn btn-ghost wn-go" onClick={closeInstallGuide}>
              Done
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

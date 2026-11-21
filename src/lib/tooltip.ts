// Hover labels for icon-only buttons. Every icon button already has an
// aria-label for screen readers; on hover with a mouse, the same words show in a
// small bubble. One listener for the whole app, so new buttons get it for free.
// A `data-tip` attribute overrides the text; `data-tip=""` turns it off.

const DELAY = 450
/** Moving straight to the next button shows its label at once. */
const WARM = 600

let bubble: HTMLDivElement | null = null
let target: HTMLElement | null = null
let timer = 0
let lastHidden = 0

const ICONISH = 'button, a, [role="button"], [role="tab"], [role="radio"], [role="switch"]'

function labelFor(el: HTMLElement): string | null {
  if (el.dataset.tip !== undefined) return el.dataset.tip || null
  const label = el.getAttribute('aria-label') || el.getAttribute('title')
  if (!label) return null
  // Buttons that already show their words don't need a bubble.
  if ((el.textContent ?? '').trim().length > 1) return null
  return label
}

function show(el: HTMLElement, text: string) {
  bubble ??= Object.assign(document.createElement('div'), { className: 'tip', role: 'tooltip' })
  if (!bubble.isConnected) document.body.appendChild(bubble)
  // A native title would show a second, slower tooltip on top of ours.
  if (el.hasAttribute('title')) {
    el.dataset.tipTitle = el.getAttribute('title')!
    el.removeAttribute('title')
  }
  bubble.textContent = text
  bubble.classList.remove('is-below')
  bubble.style.left = '0px'
  bubble.style.top = '0px'
  bubble.classList.add('is-on')
  const r = el.getBoundingClientRect()
  const b = bubble.getBoundingClientRect()
  const gap = 8
  let top = r.top - b.height - gap
  if (top < 6) {
    top = r.bottom + gap
    bubble.classList.add('is-below')
  }
  const left = Math.min(innerWidth - b.width - 6, Math.max(6, r.left + r.width / 2 - b.width / 2))
  bubble.style.left = `${Math.round(left)}px`
  bubble.style.top = `${Math.round(top)}px`
}

function hide() {
  clearTimeout(timer)
  if (bubble?.classList.contains('is-on')) lastHidden = performance.now()
  bubble?.classList.remove('is-on')
  if (target?.dataset.tipTitle) {
    target.setAttribute('title', target.dataset.tipTitle)
    delete target.dataset.tipTitle
  }
  target = null
}

export function startTooltips() {
  addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return
    const el = (e.target as Element | null)?.closest<HTMLElement>(ICONISH)
    if (!el || el === target) return
    hide()
    const text = labelFor(el)
    if (!text || (el as HTMLButtonElement).disabled) return
    target = el
    const wait = performance.now() - lastHidden < WARM ? 0 : DELAY
    timer = window.setTimeout(() => target === el && el.isConnected && show(el, text), wait)
  })
  addEventListener('pointerout', (e) => {
    if (!target) return
    const to = e.relatedTarget as Node | null
    if (to && target.contains(to)) return
    hide()
  })
  // Anything that changes the page hides it, so it never points at the wrong thing.
  for (const type of ['pointerdown', 'keydown', 'wheel', 'blur']) addEventListener(type, hide, true)
  addEventListener('scroll', hide, true)
}

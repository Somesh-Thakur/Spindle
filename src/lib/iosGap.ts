// Home-screen apps on iPhone (viewport-fit=cover) are laid out a little shorter
// than the screen: everything pinned to the bottom sits too high, leaving an
// empty strip below it. CSS `vh` still measures the whole screen, so the
// difference is the gap. It goes in --ios-gap, and v10.css moves the bottom bars
// down by it and stretches the page to fill it. Where there's no gap it stays 0.
export function startIosGapFix() {
  const nav = navigator as Navigator & { standalone?: boolean }
  if (!nav.standalone) return
  document.documentElement.classList.add('ios-app')
  const probe = document.createElement('div')
  probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:100vh;visibility:hidden;pointer-events:none'
  document.body.appendChild(probe)
  const measure = () => {
    const gap = Math.max(0, Math.round(probe.getBoundingClientRect().height - window.innerHeight))
    // A keyboard on screen also shrinks innerHeight; don't chase that.
    document.documentElement.style.setProperty('--ios-gap', `${gap > 120 ? 0 : gap}px`)
  }
  measure()
  addEventListener('resize', measure)
  addEventListener('orientationchange', () => setTimeout(measure, 300))
}

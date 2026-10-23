// Thin wrapper around YouTube's official IFrame Player API.

declare global {
  interface Window {
    YT?: any
    onYouTubeIframeAPIReady?: () => void
  }
}

export const YT_STATE = { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } as const

type Listener = { onState: (s: number) => void; onError: (code: number) => void; onReady: () => void }

let ready: Promise<any> | null = null
let player: any = null

function loadApi(): Promise<any> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  return new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      prev?.()
      resolve(window.YT)
    }
    const s = document.createElement('script')
    s.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(s)
  })
}

/** Creates the single player inside `#yt-player` (rendered by VideoDock). */
export function ytPlayer(listener: Listener): Promise<any> {
  ready ??= loadApi().then(
    (YT) =>
      new Promise((resolve) => {
        player = new YT.Player('yt-player', {
          width: '100%',
          height: '100%',
          playerVars: { autoplay: 1, controls: 0, disablekb: 1, modestbranding: 1, playsinline: 1, rel: 0, iv_load_policy: 3, fs: 0 },
          events: {
            onReady: () => {
              listener.onReady()
              resolve(player)
            },
            onStateChange: (e: any) => listener.onState(e.data),
            onError: (e: any) => listener.onError(e.data),
          },
        })
      }),
  )
  return ready
}

export const yt = {
  get: () => player,
  time: (): number => player?.getCurrentTime?.() ?? 0,
  duration: (): number => player?.getDuration?.() ?? 0,
}

// What's new in Spindle, newest first. Listeners who've used Spindle before see
// the latest entry once (components/WhatsNew.tsx); add an entry with each release.

export interface Release {
  version: string
  date: string
  title: string
  items: { emoji: string; text: string }[]
}

export const CHANGELOG: Release[] = [
  {
    version: '1.1',
    date: '2026-10-24',
    title: 'Feedback, Discord and a desktop app',
    items: [
      { emoji: '💬', text: 'Report bugs and suggest ideas from Feedback in the sidebar. You’ll see the developer’s reply right there.' },
      { emoji: '🎧', text: 'Join the Spindle Discord to chat with other listeners and hear about updates first.' },
      { emoji: '💻', text: 'Spindle for desktop: Discord “Listening to” status, media keys, and music that keeps playing from the tray.' },
      { emoji: '⚡', text: 'Opens faster: pages load as you need them, and your listening stats sync more smoothly.' },
    ],
  },
]

export const LATEST = CHANGELOG[0]

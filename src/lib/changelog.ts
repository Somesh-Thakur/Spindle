// What's new in Spindle, newest first (changelog.json). Listeners who've used
// Spindle before see the latest entry once (components/WhatsNew.tsx), and a new
// entry is posted to the Discord announcements channel when it ships
// (.github/workflows/announce.yml). Add an entry with each release.
import changelog from './changelog.json'

export interface Release {
  version: string
  date: string
  title: string
  items: { emoji: string; text: string }[]
}

export const CHANGELOG: Release[] = changelog

export const LATEST = CHANGELOG[0]

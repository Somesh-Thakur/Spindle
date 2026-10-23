# Spindle

**Live:** https://spindle-bice.vercel.app

A music web app built like an after-hours record store: a living colour field behind everything, a crate of records to dig through, sleeves you can turn over, and a turntable that plays every song in full. No accounts, no API keys, no paid services.

The name is the pin at the centre of a turntable that every record spins on. In the wordmark, the dot of the i is a tiny record that spins while music plays.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173.

## Where the music comes from

| Source | What it gives | Cost |
| --- | --- | --- |
| iTunes Search, Lookup and chart feeds | The catalogue: daily charts per country, every song old or new, albums, artists, HD artwork | Free, no key |
| YouTube embedded player | Full-length playback of almost any song, through YouTube's official IFrame Player API | Free, no key |
| Piped / Invidious | Search: finds the YouTube upload for each iTunes song, and adds YouTube Music songs that iTunes doesn't carry | Free, no key |
| Audius | Full-length tracks from independent artists (the Radio page) | Free, no key |
| LRCLIB, then lyrics.ovh | Lyrics, synced line by line when available | Free, no key |

When you play a song, `src/api/youtube.ts` searches for it, scores the results on title, artist and length, and skips karaoke, covers and remixes. It plays the best match through the YouTube embed. Each result is cached for 30 days, so a song is only looked up once per browser. If no good match exists, or the owner has blocked embedding, it plays the 30-second iTunes preview instead.

The video shows as a small card above the player bar, or full-size in the player's Video view. The eye button hides it. YouTube's API terms ask for the player to stay visible while it plays, so hiding it is your call to make. YouTube could change how hidden embeds behave.

### Optional: a YouTube Data API key

Public Piped and Invidious servers come and go. For a lookup that never goes down, create a free key in the Google Cloud console (enable "YouTube Data API v3"). The free quota allows about 100 lookups a day. Then add it to a `.env` file in this folder:

```
VITE_YT_API_KEY=your-key-here
```

It's only used when the free mirrors fail.

## Search

Press **/** or **Ctrl+K** anywhere to search. Each search queries iTunes and YouTube Music together (`src/lib/rank.ts`). Duplicates are merged, results are ranked by how well title and artist match, originals beat remixes, lofi flips and covers unless you typed those words, and YouTube Music's popularity order breaks ties.

## Lyrics

- Lookup: LRCLIB exact match, then LRCLIB search (artist must match), then lyrics.ovh. "Not found" is only remembered for the session, so a busy server doesn't hide lyrics for days.
- **Hinglish:** Hindi lyrics in Devanagari are shown in Latin letters by default (`src/lib/hinglish.ts`), with a Hinglish / हिन्दी switch.
- **Add your own:** when nothing is found, paste the lyrics, then tap along (or press Space) as each line starts to time them. Saved on this device, and used ahead of anything online.

## Playlists

Create them from Your Library, the + in the sidebar, or any song's ••• menu (Add to playlist). Drag the handle to reorder, click the title to rename. The cover defaults to a mosaic of the songs' covers; hover it to choose your own image (or drop one on it), and switch back any time. Images are centre-cropped and shrunk to 640px before saving. Everything is saved on this device until accounts exist.

## Import from Spotify, Apple Music and YouTube Music

Open **Import Music** in the sidebar (or **Import** in Your Library).

| Paste a link | What's read | Notes |
| --- | --- | --- |
| Spotify playlist or album | Its public embed page | First 100 tracks of a playlist |
| Apple Music playlist or album | Its public page, including each song's Apple ID | Matched exactly through iTunes |
| YouTube or YouTube Music playlist or album | Its public page, then YouTube's own "load more" requests | Thousands of songs |

Links only see public or unlisted playlists. For **Liked Songs and private playlists**, export a file with a free tool and drop it on the page:

- **Spotify:** [Exportify](https://exportify.app) → Export All → one CSV per playlist, including Liked Songs
- **YouTube Music:** [Google Takeout](https://takeout.google.com) → YouTube and YouTube Music → playlists → one CSV per playlist (video IDs only; titles are filled in from YouTube)
- **Apple Music or any other service:** [TuneMyMusic](https://www.tunemymusic.com/transfer) → Export to file (free up to 500 songs)
- **Anything else:** a TXT file with one song per line: "Artist - Song", "Song - Artist" or "Song by Artist" all work

Every song is then matched: Apple Music songs through the iTunes catalogue, everything else on YouTube Music by title, artist and length (which also gives proper square cover art). Songs without a confident match are still added and are looked up again when played. Each import becomes a playlist, with the source's own cover.

Pages from these services can't be read from a browser directly, so a small function does it: `server/import.ts`. In development the Vite dev server runs it at `/api/import`; when deployed to Vercel, `api/import.ts` runs the same code as a free serverless function.

## Karaoke

Open it with the microphone button in the player bar or the full player.

- **Lyrics** fill in word by word. Free lyric sources only time whole lines, so each word's timing is estimated from its line (`wordsOf` in `src/api/lyrics.ts`). If the lyrics drift, nudge them earlier or later with the − / + buttons.
- **Vocals, YouTube songs:** Off switches to a karaoke or instrumental upload of the same song (`findInstrumentals` in `src/api/youtube.ts`) at the same point. Versions of matching length are preferred, since their timing usually lines up with the lyrics.
- **Vocals, Radio and preview tracks:** a slider removes the vocals live with a mid/side filter (`src/lib/audio.ts`). Lead vocals sit in the centre of a stereo mix, so turning the centre down removes most of the voice while the bass and cymbals are added back.

## Design

- `src/components/AuraField.tsx`: the WebGL colour field behind the app, tinted by the current cover and pulsing with the music
- `src/components/Crate.tsx`: the Home hero; scroll to flip through records
- `src/components/Timeline.tsx`: the decades, scrolled sideways
- `src/components/Sleeve.tsx`: album pages as a record sleeve with Side A / Side B; the artist stage
- `src/components/Brand.tsx`: the Spindle logo and wordmark
- `src/components/Intro.tsx`: the opening (once per visit; any key or click skips it)
- `src/components/Cursor.tsx`: the custom cursor: a dot that never lags plus a ring that reads what's underneath (play, open, link, drag)
- `src/pages/Search.tsx`: the search stage; its field shares a layout with the sidebar's, so it grows out of it
- `src/components/CoverEditor.tsx`: playlist cover upload
- `src/styles/v3.css`, `v4.css`, `v5.css`: styles for all of the above

## Deploy for free

This project is deployed on Vercel and linked to GitHub: every push to `main` goes live automatically.

Deploy to **Vercel** (free Hobby plan): import the repo, keep the detected Vite settings, and it serves the site plus the `/api/import` function with no extra setup.

`npm run build` also outputs a plain static site in `dist/` that works on any static host (Netlify, Cloudflare Pages, GitHub Pages), thanks to hash routing. On those, everything works except importing from links; importing from export files still works, because files are read in the browser.

## Keyboard

| Key | Action |
| --- | --- |
| Space | Play / pause |
| ← / → | Seek 5 seconds |
| Shift + ← / → | Previous / next track |
| ↑ / ↓ | Volume |
| M | Mute |
| F | Open / close the full player |

## Where things are

- `src/api/`: iTunes, Audius, YouTube lookup and lyrics clients
- `src/store/player.ts`: queue, shuffle, repeat, likes and recently played (saved on the device)
- `src/components/AudioEngine.tsx`: picks YouTube or direct audio for each track, media keys, shortcuts
- `src/lib/engine.ts`: one clock and seek interface over both backends
- `src/components/VideoDock.tsx`: the single YouTube iframe, docked as a card or in the full player
- `src/components/Deck.tsx`: sleeve, spinning record and tonearm. Tap the turntable to lift or drop the needle; grab the record and turn it to scrub (clockwise forward, anticlockwise back, one full turn = 6 seconds)
- `src/styles/app.css`: glass system and all styling

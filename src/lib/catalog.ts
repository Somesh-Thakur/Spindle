// Hand-picked editorial shelves. Each resolves to a single iTunes lookup.

export interface Era {
  key: string
  title: string
  /** Short form shown large on the card. */
  short: string
  blurb: string
  artists: number[]
  tint: string
}

export const ERAS: Era[] = [
  {
    key: '80s',
    title: 'The ’80s',
    short: '’80s',
    blurb: 'Michael Jackson, Madonna, Queen, Whitney Houston',
    artists: [32940, 3296287, 20044, 13952, 155814, 166566, 122782, 59291142],
    tint: '#3d2a5c',
  },
  {
    key: '90s',
    title: 'The ’90s',
    short: '’90s',
    blurb: 'Backstreet Boys, Nirvana, Mariah Carey, Oasis',
    artists: [217039, 112018, 91853, 646793, 512633, 17360, 217005, 13874],
    tint: '#5a3320',
  },
  {
    key: '2000s',
    title: 'The 2000s',
    short: '2000s',
    blurb: 'Beyoncé, Eminem, Linkin Park, Rihanna',
    artists: [1419227, 111051, 148662, 63346553, 471744, 15885, 360391, 459885],
    tint: '#1f3a52',
  },
  {
    key: '2010s',
    title: 'The 2010s',
    short: '2010s',
    blurb: 'Adele, Ed Sheeran, Taylor Swift, Drake',
    artists: [262836961, 183313439, 278873078, 159260351, 271256, 358714030, 412778295, 966309175],
    tint: '#1d4436',
  },
  {
    key: 'desi',
    title: 'Bollywood Classics',
    short: 'Bollywood',
    blurb: 'Kishore Kumar, Lata Mangeshkar, A. R. Rahman, Arijit Singh',
    artists: [484568188, 3249567, 19715559, 14291581, 14291575, 213157068, 300187267, 18056658],
    tint: '#5c2335',
  },
]

export interface Genre {
  id: number
  name: string
  tint: string
}

/** iTunes genre ids, used with the top-songs chart feed. */
export const GENRES: Genre[] = [
  { id: 14, name: 'Pop', tint: '#8c3553' },
  { id: 18, name: 'Hip-Hop', tint: '#2f3f8c' },
  { id: 1263, name: 'Bollywood', tint: '#a04a1f' },
  { id: 21, name: 'Rock', tint: '#7a2626' },
  { id: 17, name: 'Dance', tint: '#5b2f8c' },
  { id: 15, name: 'R&B', tint: '#6b3a5e' },
  { id: 7, name: 'Electronic', tint: '#1f6470' },
  { id: 20, name: 'Alternative', tint: '#4a5a2a' },
  { id: 51, name: 'K-Pop', tint: '#8c4a7a' },
  { id: 12, name: 'Latin', tint: '#9a6a12' },
  { id: 6, name: 'Country', tint: '#7a5232' },
  { id: 11, name: 'Jazz', tint: '#24456e' },
  { id: 5, name: 'Classical', tint: '#5e5240' },
  { id: 1262, name: 'Regional Indian', tint: '#8a3a2a' },
  { id: 1185, name: 'Indian Pop', tint: '#7a2c4a' },
  { id: 2, name: 'Blues', tint: '#263a66' },
]

export const AUDIUS_GENRES = ['Electronic', 'Hip-Hop/Rap', 'Lo-Fi', 'Alternative', 'Pop', 'R&B/Soul', 'Ambient', 'House']

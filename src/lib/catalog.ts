import type { Song } from "@/types/music";

/**
 * Local song catalog. The energy / valence / tempo values are hand-made
 * approximations used to place songs in the universe. YouTube and Spotify IDs
 * were verified against each platform's oEmbed endpoint; when no reliable ID is
 * known the field is omitted and the app offers a search link instead.
 */
export const CATALOG: Song[] = [
  { id: "blinding-lights", title: "Blinding Lights", artist: "The Weeknd", year: 2019, genre: "pop", energy: 0.8, valence: 0.33, tempo: 171, key: 1, durationSec: 200, youtubeId: "4NRXx6U8ABQ", spotifyId: "0VjIjW4GlUZAMYd2vXMi3b" },
  { id: "bohemian-rhapsody", title: "Bohemian Rhapsody", artist: "Queen", year: 1975, genre: "rock", energy: 0.4, valence: 0.23, tempo: 72, key: 10, durationSec: 354, youtubeId: "fJ9rUzIMcZQ", spotifyId: "4u7EnebtmKWzUH433cf5Qv" },
  { id: "despacito", title: "Despacito", artist: "Luis Fonsi ft. Daddy Yankee", year: 2017, genre: "urban", energy: 0.8, valence: 0.84, tempo: 89, key: 2, durationSec: 229, youtubeId: "kJQP7kiw5Fk", spotifyId: "6habFhsOp2NvshLv26DqMb" },
  { id: "take-five", title: "Take Five", artist: "The Dave Brubeck Quartet", year: 1959, genre: "jazz", energy: 0.26, valence: 0.6, tempo: 174, key: 3, durationSec: 324, youtubeId: "vmDDOFXSgAs" },
  { id: "get-lucky", title: "Get Lucky", artist: "Daft Punk ft. Pharrell Williams", year: 2013, genre: "electronic", energy: 0.81, valence: 0.86, tempo: 116, key: 6, durationSec: 369, youtubeId: "5NV6Rdv1a3I" },
  { id: "smells-like-teen-spirit", title: "Smells Like Teen Spirit", artist: "Nirvana", year: 1991, genre: "rock", energy: 0.91, valence: 0.72, tempo: 117, key: 5, durationSec: 301, youtubeId: "hTWKbfoikeg", spotifyId: "5ghIJDpPoe3CfHMGu71E6T" },
  { id: "clair-de-lune", title: "Clair de Lune", artist: "Claude Debussy", year: 1905, genre: "classical", energy: 0.05, valence: 0.3, tempo: 66, key: 1, durationSec: 300 },
  { id: "somebody-that-i-used-to-know", title: "Somebody That I Used to Know", artist: "Gotye ft. Kimbra", year: 2011, genre: "indie", energy: 0.52, valence: 0.75, tempo: 129, key: 0, durationSec: 244, youtubeId: "8UVNT4wvIGY" },
  { id: "take-on-me", title: "Take On Me", artist: "a-ha", year: 1985, genre: "pop", energy: 0.9, valence: 0.88, tempo: 169, key: 6, durationSec: 225, youtubeId: "djV11Xbc914", spotifyId: "2WfaOiMkCvy7F5fcp2zZ8L" },
  { id: "weightless", title: "Weightless", artist: "Marconi Union", year: 2011, genre: "ambient", energy: 0.08, valence: 0.12, tempo: 60, key: 4, durationSec: 480 },

  { id: "never-gonna-give-you-up", title: "Never Gonna Give You Up", artist: "Rick Astley", year: 1987, genre: "pop", energy: 0.94, valence: 0.92, tempo: 113, key: 8, durationSec: 213, youtubeId: "dQw4w9WgXcQ", spotifyId: "4cOdK2wGLETKBW3PvgPWqT" },
  { id: "sweet-child-o-mine", title: "Sweet Child O' Mine", artist: "Guns N' Roses", year: 1987, genre: "rock", energy: 0.9, valence: 0.63, tempo: 125, key: 6, durationSec: 356, youtubeId: "1w7OgIMMRc4", spotifyId: "7o2CTH4ctstm8TNelqjb51" },
  { id: "uptown-funk", title: "Uptown Funk", artist: "Mark Ronson ft. Bruno Mars", year: 2014, genre: "pop", energy: 0.61, valence: 0.93, tempo: 115, key: 0, durationSec: 270, youtubeId: "OPf0YbXqDm0", spotifyId: "32OlwWuMpZ6b0aN2RZOeMS" },
  { id: "mr-brightside", title: "Mr. Brightside", artist: "The Killers", year: 2004, genre: "indie", energy: 0.92, valence: 0.24, tempo: 148, key: 1, durationSec: 222, youtubeId: "gGdGFtwCNBE", spotifyId: "003vvx7Niy0yvhvHt4a68B" },
  { id: "shape-of-you", title: "Shape of You", artist: "Ed Sheeran", year: 2017, genre: "pop", energy: 0.65, valence: 0.93, tempo: 96, key: 1, durationSec: 234, youtubeId: "JGwWNGJdvx8", spotifyId: "7qiZfU4dY1lWllzX7mPBI3" },
  { id: "billie-jean", title: "Billie Jean", artist: "Michael Jackson", year: 1982, genre: "pop", energy: 0.65, valence: 0.85, tempo: 117, key: 6, durationSec: 294, youtubeId: "Zi_XLOBDo_Y" },
  { id: "faded", title: "Faded", artist: "Alan Walker", year: 2015, genre: "electronic", energy: 0.63, valence: 0.16, tempo: 90, key: 3, durationSec: 212, youtubeId: "60ItHLz5WEA" },
  { id: "rolling-in-the-deep", title: "Rolling in the Deep", artist: "Adele", year: 2010, genre: "pop", energy: 0.77, valence: 0.52, tempo: 105, key: 8, durationSec: 228, youtubeId: "rYEDA3JcQqw" },
  { id: "radioactive", title: "Radioactive", artist: "Imagine Dragons", year: 2012, genre: "rock", energy: 0.78, valence: 0.24, tempo: 137, key: 9, durationSec: 187, youtubeId: "ktvTqknDobU" },
  { id: "counting-stars", title: "Counting Stars", artist: "OneRepublic", year: 2013, genre: "indie", energy: 0.71, valence: 0.48, tempo: 122, key: 1, durationSec: 257, youtubeId: "hT_nvWreIhg" },
  { id: "waka-waka", title: "Waka Waka (Esto es África)", artist: "Shakira", year: 2010, genre: "urban", energy: 0.86, valence: 0.76, tempo: 127, key: 7, durationSec: 202, youtubeId: "pRpeEdMmmQ0" },
  { id: "livin-on-a-prayer", title: "Livin' on a Prayer", artist: "Bon Jovi", year: 1986, genre: "rock", energy: 0.89, valence: 0.8, tempo: 123, key: 4, durationSec: 249, youtubeId: "lDK9QqIzhwk" },
  { id: "eye-of-the-tiger", title: "Eye of the Tiger", artist: "Survivor", year: 1982, genre: "rock", energy: 0.77, valence: 0.55, tempo: 109, key: 0, durationSec: 245, youtubeId: "btPJPFnesV4" },
  { id: "levitating", title: "Levitating", artist: "Dua Lipa", year: 2020, genre: "pop", energy: 0.82, valence: 0.91, tempo: 103, key: 6, durationSec: 203, youtubeId: "TUVcZfQe-Kw" },
  { id: "gasolina", title: "Gasolina", artist: "Daddy Yankee", year: 2004, genre: "urban", energy: 0.94, valence: 0.8, tempo: 96, key: 1, durationSec: 192 },
  { id: "strobe", title: "Strobe", artist: "deadmau5", year: 2009, genre: "electronic", energy: 0.55, valence: 0.2, tempo: 128, key: 9, durationSec: 637 },
  { id: "nuvole-bianche", title: "Nuvole Bianche", artist: "Ludovico Einaudi", year: 2004, genre: "classical", energy: 0.12, valence: 0.2, tempo: 70, key: 5, durationSec: 357 },
  { id: "so-what", title: "So What", artist: "Miles Davis", year: 1959, genre: "jazz", energy: 0.2, valence: 0.45, tempo: 136, key: 2, durationSec: 562 },
];

/** Songs the playlist starts with (first 10 of the catalog). */
export const INITIAL_PLAYLIST: Song[] = CATALOG.slice(0, 10);

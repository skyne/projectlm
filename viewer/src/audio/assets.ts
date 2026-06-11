/** Bundled audio paths — see viewer/public/audio/licenses/ for attribution. */

export const MUSIC_PLAYLISTS = {
  menu: [
    "/audio/music/menu-ambient.mp3",
    "/audio/music/menu-valley-sunset.mp3",
    "/audio/music/menu-spirit-woods.mp3",
    "/audio/music/menu-zanarkand.mp3",
    "/audio/music/menu-relax-beat.mp3",
    "/audio/music/menu-relaxation-05.mp3",
    "/audio/music/menu-forest-treasure.mp3",
    "/audio/music/menu-smooth-meditation.mp3",
  ],
  race: [
    "/audio/music/race-tension.mp3",
    "/audio/music/race-sports-highlights.mp3",
    "/audio/music/race-games-music.mp3",
    "/audio/music/race-daredevil.mp3",
    "/audio/music/race-techno-fest.mp3",
    "/audio/music/race-trap-electro.mp3",
    "/audio/music/race-a-game.mp3",
    "/audio/music/race-rought-ready.mp3",
  ],
  briefing: [
    "/audio/music/race-worldbeat.wav",
    "/audio/music/briefing-epic-games.mp3",
    "/audio/music/briefing-placeit-world.mp3",
    "/audio/music/briefing-sci-fi-score.mp3",
    "/audio/music/briefing-fright-night.mp3",
    "/audio/music/briefing-echoes.mp3",
    "/audio/music/briefing-fallen.mp3",
    "/audio/music/briefing-nield-grohm.mp3",
  ],
} as const;

export const AUDIO_ASSETS = {
  music: MUSIC_PLAYLISTS,
  sfx: {
    uiClick: "/audio/sfx/ui/click.ogg",
    uiConfirm: "/audio/sfx/ui/confirm.ogg",
    uiError: "/audio/sfx/ui/error.ogg",
    uiToggle: "/audio/sfx/ui/toggle.ogg",
    greenFlag: "/audio/sfx/whistle-start.wav",
    crowdCheer: "/audio/sfx/crowd-cheer.wav",
    stadiumCrowd: "/audio/sfx/stadium-crowd.wav",
  },
} as const;

/** Verified Mixkit car pass-by clips (3–5s each). */
export const PASS_BY_ASSETS = {
  passBy1: "/audio/sfx/pass-by/car-fast-driveby.wav",
  passBy2: "/audio/sfx/pass-by/car-swoosh.wav",
  passBy3: "/audio/sfx/pass-by/car-pass-ambience.wav",
} as const;

export type MusicTrackId = keyof typeof MUSIC_PLAYLISTS;
export type SfxId = keyof typeof AUDIO_ASSETS.sfx;
export type PassById = keyof typeof PASS_BY_ASSETS;

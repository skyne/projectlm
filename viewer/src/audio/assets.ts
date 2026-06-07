/** Bundled audio paths — see viewer/public/audio/licenses/ for attribution. */

export const AUDIO_ASSETS = {
  music: {
    menu: "/audio/music/menu-ambient.mp3",
    race: "/audio/music/race-tension.mp3",
    briefing: "/audio/music/race-worldbeat.wav",
  },
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

export type MusicTrackId = keyof typeof AUDIO_ASSETS.music;
export type SfxId = keyof typeof AUDIO_ASSETS.sfx;
export type PassById = keyof typeof PASS_BY_ASSETS;

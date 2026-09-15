# Material-specific interaction audio

The second sound pass replaces the shared wet character with **45 short clips across nine banks** (1,019,108 bytes). Every soft toy has its own press, release and movement files, plus its own timing, filtering and balance. Jelly cutters use a separate blade bank. No Archos slime recordings remain in playback or the shipped asset folder.

| Toy | Sound direction | Source material |
| --- | --- | --- |
| Jelly | Short, muted, rounded taps; faint movement | Kenney soft impacts and cloth-belt friction |
| Butter | Soft compression and a slow, quiet release | Kenney carpet contacts and fabric movement |
| Cushion | Airy fabric rustle | martian cloth recording |
| Loop | Restrained tension creaks and short releases | Kenney creaks and belt handling |
| Star | Light, quick, soft contacts | Separate Kenney soft impacts and cloth cuts |
| Dumpling | Heavier, muffled contacts | Kenney leather drop and cloth-belt movement |
| Putty | Dry handling and friction | Kenney small-leather and belt recordings |
| Dough | Soft kneading texture | Haydonus cookie dough recording, shortened and softened |
| Jelly Slice / Prism | Dry blade friction and a short exit | Kenney knife drawing and slicing |

These are edited foley analogues, not claims that every physical toy was recorded. In particular, the Butter bank is designed to suggest foam using carpet/fabric sounds. Loop tension uses creak/belt sounds. Both Resting and Free modes inherit their toy's bank.

## Sources and license

- [Impact Sounds by Kenney](https://kenney.nl/assets/impact-sounds): soft impacts and carpet contacts. CC0, confirmed on the source page and in the downloaded archive's License.txt.
- [RPG Audio by Kenney](https://kenney.nl/assets/rpg-audio): cloth, leather handling, creaks, belts and knife foley. CC0, confirmed in the downloaded archive's License.txt.
- [CookieDough(Scooped) by Haydonus](https://freesound.org/people/Haydonus/sounds/732392/): CC0. Uses the HQ MP3 preview downloaded during the first pass.
- [foley cloth rustle.wav by martian](https://freesound.org/people/martian/sounds/19291/): CC0. Uses the previously downloaded HQ MP3 preview.

[The manifest](../public/audio/asmr/sources.json) records the exact archive entries, download URLs, cut positions, processing and SHA-256 hashes. New Freesound rubber/mat/leather candidates could not be downloaded and are not included or credited as shipped assets. Kenney inputs are distributed OGG files. Converting compressed inputs to WAV does not restore lost detail. All sources were checked September 13, 2026.

## Playback and preparation

`python scripts/prepare-asmr.py` rebuilds the checked-in WAVs using Python 3 and FFmpeg. It caches source media under `.local/asmr-sources/`; build/deployment needs neither FFmpeg nor source downloads. Output is mono 32 kHz PCM16, high-passed at 90 Hz, filtered per material, lightly denoised and faded. Accents are mostly 0.11-0.32 seconds. Motion clips are slowed without pitch shifting, gently compressed and joined with a short loop seam. Normalization targets 0.055 RMS with a 0.50 peak ceiling; runtime gain is quieter again.

Release and motion are intentionally less prominent than contact. Pops use shortened contacts from their own material, not a universal splat. Banks load on sound enable, decode once, stay on the local origin, and recover from failed downloads on retry. Versioned `v2-` filenames avoid stale first-pass recordings in the browser. Voice caps and mute/disposal guards remain in place. The Fly image includes the audio directory.

## Verification

The audio/asset tests cover distinct bank selection for all eight soft toys, no slime fallback, file hashes, PCM integrity, headroom, caching, retries, mute during loading, cleanup, variations and voice limits. `node qa/slice-smoke.mjs --audio-only` decodes and renders all nine banks in Chrome. All are audible under interaction and silent after mute; rendered peaks range from 0.035 to 0.116. Build: `npm run build:fly`.

The prior full suite has an unrelated default-toy assertion in `tests/player.test.ts` expecting Jelly despite the Butter-first registry. Headphone listening is the subjective quality check; signal measurements cannot establish an ASMR response.

# fomies — "what is @FomiesNFT?" motion graphic

16:9 (1920×1080, 60 fps, ~60 s) motion graphic for an X/Twitter post about
[fomies.family](https://fomies.family/), the Department of FOMO.

Final file: **`fomies_what_is.mp4`**

## Storyboard

| time | scene |
|---|---|
| 0–5 s | eyes open, "what is" → `fomies` logo drops in, `@FomiesNFT ?` |
| 5–10 s | case file is typed out: an NFT collection built around a fictional government office, stamped **THE DEPARTMENT OF FOMO, EST. 2026** |
| 10–12 s | the website isn't a ~~normal landing page~~. it's a building you walk through |
| 12–17 s | walk the corridor ("you are here"), a door gets boarded up, the elevator is **under repair** |
| 17–21 s | building directory → basement → corridor b → intake office |
| 21–27 s | the blinds of **WINDOW 3** roll up on the clerk, then the motto: **ALWAYS EARLY. ALWAYS WATCHING.** |
| 27–35 s | no boring form: ring the bell, take a number (042), answer 3 questions, then the department decides (UNDER REVIEW) |
| 35–43 s | inside the office: clipboard tasks, noticeboard, staff gallery, and an ID card that flips, exports and shares |
| 43–47 s | opening hours: mon–fri when open, sat–sun *allegedly* |
| 47–54 s | honesty: art, entertainment, community. no promises of profit. disclaimer |
| 54–60 s | logo, the department of fomo · est. 2026, fomies.family, @FomiesNFT |

## How it's made

* `index.html` + `anim.js` hold a deterministic canvas animation: `renderFrame(t)` draws any frame.
  Open `index.html` through a local server (`npx http-server .`) to preview it, and click to play it with sound.
* `render.mjs` drives headless Chromium (Playwright) frame by frame and pipes the frames into ffmpeg.
  It also exports `out/cues.json`, the sound-effect cues the scenes emit.
* `audio.py` (numpy/scipy) synthesizes everything: an original 120 BPM groove (drums, bass, marimba, pads)
  plus every sound effect (stamps, desk bell, typewriter, whooshes, and so on), placed from the cues.
* `build.sh` runs the whole pipeline: `./build.sh` (set `FPS=30` for a faster draft).

Art in `assets/` is cropped from the official fomies artwork. The colors match the site's lavender (`#b2a4f0`),
and the type is Fredoka (logo style), Special Elite (government forms), Inter and Permanent Marker.

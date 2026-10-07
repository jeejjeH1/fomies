#!/usr/bin/env bash
# Full pipeline: frames -> silent video, cues -> synthesized soundtrack, mux for X/Twitter.
set -euo pipefail
cd "$(dirname "$0")"
FPS="${FPS:-60}"
mkdir -p out
node render.mjs video "$FPS" out/silent.mp4
python3 audio.py out/cues.json out/fomies_audio.wav
ffmpeg -y -loglevel error -i out/silent.mp4 -i out/fomies_audio.wav \
  -map 0:v -map 1:a -c:v copy \
  -af "loudnorm=I=-14:TP=-1.5:LRA=11" -c:a aac -b:a 256k -ar 48000 \
  -shortest -movflags +faststart fomies_what_is.mp4
echo "done -> fomies_what_is.mp4"

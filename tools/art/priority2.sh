#!/usr/bin/env bash
# The second batch: the 特設ガチャ banner and the loading screen first (they show the star-6 character already made), then
# the 30 new characters (4-star, then 3-star), then the pictures that were remade with real characters in them
# (the standard banner, the event banners, the premium pass header). Run from the project folder.
K4="kurenai sieg thorne gale ivy lilith quartz brann raijin ouka"
K3="haruka jin sora gen rosa taiga miru orga lune felix tsubame robin ines kaede gustav bruno doris lena noel mimi"
ids() { for k in "$@"; do printf "hero_%s," "$k"; done; }
node tools/art/generate.mjs --yes --concurrency 3 --only "banner_special,loading_screen"
node tools/art/generate.mjs --yes --concurrency 3 --only "$(ids $K4)$(ids $K3)"
node tools/art/generate.mjs --yes --concurrency 3 --force --only "banner_standard,event_infinite,event_premium,event_sample,event_premium_header"

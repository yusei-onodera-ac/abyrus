#!/usr/bin/env bash
# Makes the village pictures first, level by level (every building's level 1, then every level 2, ...), because a missing
# level is drawn with the nearest lower one; then decorations and the rest. Run from the project folder.
K="castle shop market house lumber quarry mine fence gate"
ids() { for k in $K; do printf "village_%s_%s," "$k" "$1"; done; }
node tools/art/generate.mjs --yes --concurrency 3 --only "$(ids 1)village_tree_1,village_flowers_1,village_fountain_1,village_statue_1,village_construction"
node tools/art/generate.mjs --yes --concurrency 3 --only "$(ids 2)"
node tools/art/generate.mjs --yes --concurrency 3 --only "$(ids 3)"
node tools/art/generate.mjs --yes --concurrency 3 --group bg_battle,bg_region,bg_story
node tools/art/generate.mjs --yes --concurrency 3

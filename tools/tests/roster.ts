// The roster as a whole: every character has what the game needs of it (a picture, home lines with their voices, a skill kit),
// and the list the pictures are made from (tools/art/newCharacters.mjs) says the same as data/heroes.ts.
import fs from 'node:fs';
import path from 'node:path';
import { HERO_ROSTER } from '../../src/game/data/heroes';
import { HERO_SKILLS, RARITY_SKILL_SLOTS } from '../../src/game/data/skills';
import { homeLinesFor } from '../../src/game/data/homeLines';
import { PERSONAL_LINES } from '../../src/game/data/heroLines';
import { NEW_CHARACTERS } from '../art/newCharacters.mjs';

let failures = 0;
function ok(cond: unknown, label: string): void {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
}
const here = (...parts: string[]): string => path.resolve(process.cwd(), ...parts);
const names = (list: string[]): string => (list.length ? ` -> ${list.slice(0, 12).join(' ')}${list.length > 12 ? ` ...(${list.length})` : ''}` : '');

const ids = new Set(HERO_ROSTER.map((h) => h.id));
ok(ids.size === HERO_ROSTER.length, `hero ids are unique (${HERO_ROSTER.length} heroes)`);

// home lines: three of the character's own, spoken in a voice file each
const noLines = HERO_ROSTER.filter((h) => (PERSONAL_LINES[h.id]?.length ?? 0) !== 3).map((h) => h.id);
ok(noLines.length === 0, `every hero has three home lines of their own${names(noLines)}`);
const stray = Object.keys(PERSONAL_LINES).filter((id) => !ids.has(id));
ok(stray.length === 0, `no home lines for a character who does not exist${names(stray)}`);
const emptyLine = HERO_ROSTER.filter((h) => PERSONAL_LINES[h.id]?.some((l) => l.trim().length === 0 || l.length > 40)).map((h) => h.id);
ok(emptyLine.length === 0, `no home line is empty or longer than 40 characters${names(emptyLine)}`);

const noVoice: string[] = [];
for (const h of HERO_ROSTER) for (const line of homeLinesFor(h.id, h.heroClass)) if (!fs.existsSync(here('public/assets/voice', `${line.voice}.mp3`))) noVoice.push(line.voice);
ok(noVoice.length === 0, `every home line has its voice file${names(noVoice)}`);

// pictures
const noPicture = HERO_ROSTER.filter((h) => !fs.existsSync(here('public/assets/characters', `${h.id}.png`))).map((h) => h.id);
ok(noPicture.length === 0, `every hero has a picture${names(noPicture)}`);

// the two small pictures the game keeps in memory for everybody (tools/art/make_thumbs.py); the big illustration is loaded on demand
const noThumb = HERO_ROSTER.filter((h) => !fs.existsSync(here('public/assets/characters/bust', `${h.id}.png`)) || !fs.existsSync(here('public/assets/characters/fit', `${h.id}.png`))).map((h) => h.id);
ok(noThumb.length === 0, `every hero has its bust and fit pictures (python tools/art/make_thumbs.py)${names(noThumb)}`);

// skills: as many as the rarity grants, each with a name and a line
const badKit = HERO_ROSTER.filter((h) => (HERO_SKILLS[h.id]?.length ?? 0) !== RARITY_SKILL_SLOTS[h.rarity]).map((h) => h.id);
ok(badKit.length === 0, `every hero has exactly the skills its rarity grants${names(badKit)}`);
const badSkill = HERO_ROSTER.filter((h) => (HERO_SKILLS[h.id] ?? []).some((s) => !s.name || !s.description.endsWith('。'))).map((h) => h.id);
ok(badSkill.length === 0, `every skill has a name and a sentence${names(badSkill)}`);
const strayKits = Object.keys(HERO_SKILLS).filter((id) => !ids.has(id));
ok(strayKits.length === 0, `no skill kit for a character who does not exist${names(strayKits)}`);

// the picture list and the roster agree
const mismatch: string[] = [];
for (const [id, rarity, heroClass, name, gender] of NEW_CHARACTERS as [string, number, string, string, string][]) {
  const def = HERO_ROSTER.find((h) => h.id === id);
  if (!def || def.rarity !== rarity || def.heroClass !== heroClass || def.name !== name || (gender !== 'm' && gender !== 'f')) mismatch.push(id);
}
ok(mismatch.length === 0, `tools/art/newCharacters.mjs agrees with data/heroes.ts (id, name, class, rarity)${names(mismatch)}`);
ok(NEW_CHARACTERS.length === 80, 'the roster doubled: 80 characters were added');

if (failures) process.exit(1);

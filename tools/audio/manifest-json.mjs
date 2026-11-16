// Prints the music / jingle / sound-effect lists as JSON (read by process.py).
import { JINGLES, MUSIC, SFX } from './manifest.mjs';
console.log(JSON.stringify([...MUSIC, ...JINGLES, ...SFX]));

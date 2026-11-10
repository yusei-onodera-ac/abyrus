// What to make: background music (Lyria on Vertex AI), the voice lines (Gemini text-to-speech) and a few sound effects.
// Read by generate.mjs; process.py turns the raw output into the mp3 files the game loads.
//
//   music  -> public/assets/audio/bgm/<id>.mp3   (a loop of about 30 seconds)
//   jingle -> public/assets/audio/bgm/<id>.mp3   (a short piece: cut to `seconds`, faded out)
//   sfx    -> public/assets/audio/se/<id>.mp3    (EXPERIMENTAL: there is no sound-effect model; a music model is asked for a
//                                                  single sound and the first `seconds` are kept)
//   voice  -> public/assets/voice/<line id>.mp3  (the lines come from the game's own data: tutorial steps and home lines)

const LOOP = 'It must loop smoothly. Instrumental only, no vocals, no lyrics.';

export const MUSIC = [
  ['home', 'Warm, hopeful heroic fantasy theme for a mobile RPG home screen: gentle orchestra with strings, soft piano, harp and a light flute melody, relaxed mid-tempo, a feeling of adventure about to begin.'],
  ['map', 'Adventurous travelling theme for a fantasy world map: acoustic guitar, whistle and light percussion over warm strings, a steady walking rhythm, optimistic.'],
  ['battle', 'Energetic fantasy battle music for a mobile RPG: driving orchestral strings and brass, taiko drums, fast tempo, heroic and exciting but not too heavy.'],
  ['boss', 'Intense dramatic boss battle music: pounding drums, dark brass, urgent strings and a choir, fast and menacing, building tension.'],
  ['final', 'Epic apocalyptic final battle music: huge orchestra with a thundering choir, pipe organ and heavy percussion, grand, desperate and heroic.'],
  ['story', 'Emotional cinematic story scene music: tender solo piano with soft strings, slow, melancholic yet hopeful, spacious.'],
  ['gacha', 'Mystical shimmering summoning music: glittering harp and bells, ethereal choir pads, rising magical atmosphere, slow and wondrous.'],
  ['village', 'Cozy medieval village music: lute, wooden flute, light hand percussion and pizzicato strings, bright and peaceful, folk-like, relaxed.'],
  ['infinite', 'Tense endless-trial music: pulsing synth bass blended with dark orchestra and taiko, steady driving tempo that keeps building, futuristic fantasy.'],
  ['shop', 'Lively fantasy market music: playful accordion, fiddle and tambourine in a cheerful folk dance rhythm, bustling and friendly.'],
].map(([id, what]) => ({ id: `bgm_${id}`, kind: 'music', out: `audio/bgm/${id}.mp3`, prompt: `${what} ${LOOP}`, negative: 'vocals, singing, lyrics, speech, noise, distortion' }));

export const JINGLES = [
  ['victory', 6, 'A short triumphant victory fanfare: bright brass and strings, a rising heroic phrase that ends on a strong final chord.'],
  ['defeat', 6, 'A short sombre defeat sting: slow descending strings and a low horn, sad and quiet, ending on a fading chord.'],
  ['levelup', 4, 'A short joyful level-up jingle: sparkling harp glissando, bells and a bright rising brass flourish.'],
  ['reveal5', 7, 'A short grand rare-reveal jingle: a swelling orchestra and choir rising to a radiant golden climax with bells.'],
].map(([id, seconds, what]) => ({ id: `jingle_${id}`, kind: 'jingle', seconds, out: `audio/bgm/${id}.mp3`, prompt: `${what} Instrumental only, no vocals.`, negative: 'vocals, singing, lyrics, speech, noise' }));

export const SFX = [
  ['hit', 0.5, 'A single punchy sword hit impact sound effect, short and dry, no music, no melody.'],
  ['crit', 0.7, 'A single powerful critical-hit slash impact with a metallic ring, short, no music, no melody.'],
  ['skill', 1.2, 'A single magical skill-cast whoosh with a rising shimmer, short, no music, no melody.'],
  ['heal', 1.0, 'A single soft healing chime with sparkles, short, no music, no melody.'],
  ['boom', 1.2, 'A single deep explosion boom, short, no music, no melody.'],
  ['tap', 0.2, 'A single soft wooden button tap click, extremely short, no music.'],
].map(([id, seconds, what]) => ({ id: `se_${id}`, kind: 'sfx', seconds, out: `audio/se/${id}.mp3`, prompt: what, negative: 'music, melody, vocals, speech, drums loop' }));

/** The voice: who speaks the tutorial (ルリ, a talking crow) and the home lines of each class. */
export const VOICES = {
  // Gemini TTS prebuilt voice names and the way each should sound.
  guide: { voice: 'Leda', style: 'Say this in Japanese in a bright, cheerful, lively young girl voice, like a cute talking bird mascot guiding a player: friendly, quick and expressive.' },
  warrior: { voice: 'Fenrir', style: 'Say this in Japanese in a confident, energetic young man voice, brave and warm.' },
  mage: { voice: 'Kore', style: 'Say this in Japanese in a calm, clever, slightly playful young woman voice.' },
  archer: { voice: 'Puck', style: 'Say this in Japanese in a light, upbeat, friendly young voice.' },
  tank: { voice: 'Charon', style: 'Say this in Japanese in a deep, steady, reassuring man voice.' },
  healer: { voice: 'Aoede', style: 'Say this in Japanese in a gentle, kind, soft woman voice.' },
};

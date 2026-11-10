// What to generate: one entry per missing picture. Read by generate.mjs (makes the raw picture) and process.py (cuts
// it out / resizes it and writes it into public/assets). See README.md.
//
//   id      unique name; the raw picture is tools/art/raw/<id>.png
//   group   items | equipment | banners | bg_screen | bg_battle | bg_region | bg_story | village | decor
//   out     where the finished file goes, relative to public/assets
//   mode    'cutout' (white page -> transparent PNG, cropped), 'tile' (framed square tile), 'jpg' (resized photo-like background)
//   size    final [w, h] in px (for 'cutout' of a village picture only the max width matters: it is cropped to the figure)
//   aspect  what is asked of the model ('1:1', '9:16', '16:9', '1:4', '2:3'...)
//   prompt  the whole instruction; refs = existing pictures to copy the painting style from; refPrev = the id of the picture
//           that this one is the "next level" of (its raw picture is passed as a reference when it exists)

const NO_TEXT = 'No text of any kind: no letters, no characters, no captions, no signs with writing, no logos, no watermark, no user interface.';

// ---------------------------------------------------------------------------------------------- items (3 materials)
const TILE =
  'A square game item tile for a Japanese mobile fantasy RPG, painted by hand in the same style as the reference tiles: a thick ornate gold-and-steel square frame with corner brackets around a softly glowing background, ' +
  'the item drawn large and detailed in the middle with bold dark outlines, rich saturated colours and bright highlights. The area outside the frame is plain pure white. ' + NO_TEXT;

const items = [
  ['wood', 'a neat stack of three chopped logs with pale cut ends and rough brown bark, one fresh green leaf, warm golden-brown glow behind'],
  ['iron', 'three shiny dark-steel iron ingots stacked in a pyramid with bright silver highlights and a faint blue-white glint, cool blue-grey glow behind'],
  ['stone', 'a pile of rough grey-white cut stone blocks and a chunk of raw rock with a few tiny crystal specks, soft neutral grey glow behind'],
].map(([id, what]) => ({
  id: `item_${id}`,
  group: 'items',
  out: `items/${id}.png`,
  mode: 'tile',
  size: [256, 256],
  aspect: '1:1',
  refs: ['items/exp_s.png', 'items/equip_essence.png'],
  prompt: `${TILE} The item: ${what}.`,
}));

// ---------------------------------------------------------------------------------------------- equipment (30)
const RARITY = {
  1: 'humble and plain: worn simple materials, dull colours, no glow, no decoration',
  2: 'sturdy and honest: decent craftsmanship, small modest decoration, no glow',
  3: 'refined: polished materials, fine ornament, a faint magical glint',
  4: 'rare and ornate: elaborate decoration, glowing gemstones, a visible magical aura',
  5: 'legendary masterwork: intricate gold ornament, brilliant radiant glow, floating magical particles, awe-inspiring',
};
const ICON =
  'A single fantasy RPG equipment icon painted by hand in the same style as the reference picture (detailed painterly rendering, bold dark outlines, rich colours, bright highlights), the object shown large in the centre at a slight angle, ' +
  'on a plain pure white background, no shadow on the ground, no frame, no border. ' + NO_TEXT;

const gear = [
  ['armor', 1, 0, 'cloth tunic: a plain beige linen tunic with a rope belt and rough stitching'],
  ['armor', 1, 1, 'wooden shield: a round shield of rough planks bound with a simple iron ring'],
  ['armor', 1, 2, "traveler's cloak: a patched green-brown hooded travel cloak with a wooden clasp"],
  ['armor', 2, 0, 'leather armor: a brown leather cuirass with straps and small rivets'],
  ['armor', 2, 1, 'iron shield: a heater-shaped iron shield with a plain boss and rivets'],
  ['armor', 2, 2, 'chainmail: a shirt of fine interlocking steel rings with a short hem'],
  ['armor', 3, 0, 'steel plate armor: a polished steel breastplate with shoulder guards and a thin gold trim'],
  ['armor', 3, 1, "knight's great shield: a tall kite-shaped steel shield with a blue field and a silver lion crest"],
  ['armor', 3, 2, 'guardian round shield: a round silver shield with a blue gem in the centre and a faint blue glow'],
  ['armor', 4, 0, 'dragon-scale armor: a breastplate of overlapping red-green dragon scales with horned pauldrons and glowing ember cracks'],
  ['armor', 4, 1, 'paladin shield: a white and gold holy shield with a radiant cross and a golden aura'],
  ['armor', 4, 2, 'black-iron heavy armor: massive black steel plate armor with spikes and glowing purple runes'],
  ['armor', 5, 0, 'stardust holy armor: a white-and-gold ceremonial armor set with a starry cosmic sheen, wings of light at the shoulders, glittering star dust'],
  ['armor', 5, 1, 'world-tree shield: a shield grown from living ancient wood with glowing green leaves and golden veins'],
  ['armor', 5, 2, 'sky guardian shield: a huge winged shield of white and gold with radiant light rays and a floating halo'],
  ['accessory', 1, 0, 'copper ring: a simple dull copper ring without a gem'],
  ['accessory', 1, 1, 'leather shoes: a pair of simple brown leather shoes with laces'],
  ['accessory', 1, 2, 'lucky charm: a small cloth amulet pouch on a cord, with a four-leaf clover stitched on it'],
  ['accessory', 2, 0, 'silver ring: a polished silver ring with a tiny pale stone'],
  ['accessory', 2, 1, 'gale bracelet: a silver bangle engraved with swirling wind patterns and a small feather charm'],
  ['accessory', 2, 2, "hunter's boots: sturdy brown leather boots with buckles and a fur trim"],
  ['accessory', 3, 0, 'critical pendant: a silver pendant with a faceted red gem and a thin chain'],
  ['accessory', 3, 1, 'wind-cutting boots: light teal boots with small feather wings at the ankles'],
  ['accessory', 3, 2, 'ruby ring: a gold ring with a large brilliant ruby'],
  ['accessory', 4, 0, 'hawk-eye necklace: a gold necklace with an amber pendant shaped like a hawk eye, with small feathers'],
  ['accessory', 4, 1, 'thunder anklet: a golden anklet with lightning-bolt ornaments crackling with electric blue sparks'],
  ['accessory', 4, 2, 'swift shoes: sleek crimson shoes with golden wing ornaments and a glowing aura'],
  ['accessory', 5, 0, "king's crown: a majestic golden crown set with large jewels, a radiant glow and floating sparkles"],
  ['accessory', 5, 1, 'sky-soaring wing ornament: a luminous pair of white-gold wings clasping a glowing blue gem, on a fine chain'],
  ['accessory', 5, 2, 'divine-speed boots: golden boots with large glowing wings, blue lightning trails and radiant light'],
].map(([slot, rarity, n, what]) => ({
  id: `equip_${slot}-${rarity}-${n}`,
  group: 'equipment',
  out: `equipment/${slot}-${rarity}-${n}.png`,
  mode: 'cutout',
  size: [256, 256],
  fit: 'square',
  aspect: '1:1',
  refs: [`equipment/weapon-${rarity}-0.png`],
  prompt: `${ICON} The object: ${what}. Its quality (rarity ${rarity} of 5): ${RARITY[rarity]}.`,
}));

// ---------------------------------------------------------------------------------------------- gacha banners (4)
const BANNER =
  'A wide promotional banner picture for a Japanese mobile fantasy RPG gacha screen, painted by hand in a rich, glossy anime-game style with strong lighting, glowing particles and a sense of excitement. ' +
  'Leave the lower-left quarter calmer so that a title can be placed there later. ' + NO_TEXT;
const banners = [
  ['first', 'a first-time summoning: a grand glowing golden magic circle in the centre with a rising pillar of light, a treasure chest overflowing with gems and gold coins, confetti and sparkles, a warm celebratory gold-and-pink palette'],
  ['equip_standard', 'an armory summoning: legendary swords, shields and armor floating around a glowing blue-and-gold magic circle above an anvil, sparks flying, a cool steel-blue and gold palette'],
  ['standard', 'a standard summoning: a mystical glowing violet-and-blue magic circle with floating crystals and star dust above an ancient stone altar, a calm mysterious palette'],
  ['friend_gacha', 'a friendship summoning: two warm glowing hands-shaped rays of light meeting above a magic circle, with heart-shaped sparkles, flower petals and ribbons, a friendly warm orange-and-pink palette'],
].map(([id, what]) => ({
  id: `banner_${id}`,
  group: 'banners',
  out: `gacha/${id}.jpg`,
  mode: 'jpg',
  size: [1024, 576],
  aspect: '16:9',
  refs: ['gacha/new_gacha.jpg'],
  prompt: `${BANNER} The scene: ${what}.`,
}));

// ---------------------------------------------------------------------------------------------- screen backgrounds (9)
const SCREEN =
  'A tall portrait background picture for a mobile fantasy RPG screen, painted as moody atmospheric concept art in the same dark, warm-and-teal, slightly desaturated tone as the reference. ' +
  'It sits behind menus and buttons, so keep it dark and low-contrast with soft light, no strong focal point and no bright areas in the middle. Empty of characters and creatures. ' + NO_TEXT;
const screens = [
  ['event', 'a festival plaza at dusk, strings of glowing lanterns and banners over an empty stone square'],
  ['friend', 'the warm interior of a guild tavern in the evening, wooden beams, lanterns, an empty long table and a stone hearth'],
  ['gacha', 'a mystical summoning chamber, a large faintly glowing magic circle on the floor, floating crystals and drifting light motes, deep violet and blue'],
  ['hero_detail', 'a dim ancient stone-walled hall lit by torches, a faint circular rune pattern on the stone floor, deep shadows'],
  ['message', 'a quiet candle-lit study, a wooden desk with old parchment letters, an ink pot and a quill, bookshelves in the shadows'],
  ['roster', 'a barracks armory hall, racks of swords and spears along the walls, heraldic banners hanging down, dim torchlight'],
  ['settings', 'a calm workshop of dark wood and brass, gears, instruments and shelves, a soft lamp glow'],
  ['shop', 'an evening market street with closed wooden stalls, hanging lanterns and cloth awnings, warm light and deep shadows'],
  ['stage_select', 'an old map room, a huge faded world map spread on a stone table, a compass and candles, dim and warm'],
].map(([id, what]) => ({
  id: `bg_${id}`,
  group: 'bg_screen',
  out: `backgrounds/${id}.jpg`,
  mode: 'jpg',
  size: [864, 1536],
  aspect: '9:16',
  refs: ['backgrounds/home.jpg'],
  prompt: `${SCREEN} The scene: ${what}.`,
}));

// ---------------------------------------------------------------------------------------------- battle backgrounds (7)
const BATTLE =
  'A tall portrait battlefield background for a mobile fantasy RPG, seen from high above looking straight down (top-down view) like the reference picture, with the same hand-painted game style and clean detail. ' +
  'A wide open walkable area runs down the middle of the picture from top to bottom, so units can stand on it; the sides are framed by scenery. Calm enough that characters stand out. No characters or creatures. ' + NO_TEXT;
const battles = [
  ['forest', 'a sunny deep forest: a trodden dirt path through lush green trees, mossy rocks, wild flowers'],
  ['wasteland', 'a grey ash wasteland: cracked pale earth, scattered bones and rocks, dead trees and dust, a hazy beige-grey palette'],
  ['frostpeak', 'a frozen mountain pass: packed snow and blue ice in the middle, snowy rocks and frosted pines on the sides, a cold blue-white palette'],
  ['ruins', 'a ruined stone courtyard: broken cracked flagstones, fallen pillars and overgrown walls, drifting red-purple miasma at the edges'],
  ['twilight', 'a twilight ruined city street: cobblestones, collapsed houses on both sides, a purple-orange dusk glow, long shadows'],
  ['final', 'an ominous final battle arena: a vast dark stone platform with a glowing red serpent-circle sigil in the centre, cracks leaking red light, floating embers, a black-and-crimson palette'],
  ['infinite', 'an endless trial arena: a circular platform of dark glossy stone with glowing violet runes, floating geometric shards, a deep purple and cyan palette'],
].map(([id, what]) => ({
  id: `battle_${id}`,
  group: 'bg_battle',
  out: `backgrounds/battle_${id}.jpg`,
  mode: 'jpg',
  size: [1024, 1536],
  aspect: '2:3',
  refs: ['backgrounds/battle.jpg'],
  prompt: `${BATTLE} The place: ${what}.`,
}));

// ---------------------------------------------------------------------------------------------- region maps (5)
const REGION =
  'A very tall narrow portrait landscape painted from a high three-quarter bird\'s-eye view as the backdrop of a mobile RPG stage map: a winding route will be drawn over it later, so keep the whole picture as continuous open ground and scenery from the top to the bottom, with no road, no path, no buildings in the middle. ' +
  'Hand-painted game style, clean detail, the scenery changing gently from the top (far) to the bottom (near). No characters. ' + NO_TEXT;
const regions = [
  ['forest', 'the Lost Forest: a lush bright green forest with clearings, streams, mossy boulders and wild flowers'],
  ['wasteland', 'the Ash Wasteland: a grey-beige ash desert with cracked earth, dry gullies, dead trees, bones and drifting dust'],
  ['frostpeak', 'the Azure Ice Peaks: snowy mountains with blue glaciers, frozen lakes, snow-covered pines and rocky ridges'],
  ['ruins', 'the Miasma Ruins: overgrown ancient stone ruins, broken pillars and walls with a creeping red-purple miasma'],
  ['twilight', 'the Twilight Capital: a ruined twilight city district seen from above, collapsed roofs, plazas and towers under a purple-orange dusk glow'],
].map(([id, what]) => ({
  id: `region_${id}`,
  group: 'bg_region',
  out: `backgrounds/region_${id}.jpg`,
  mode: 'jpg',
  size: [720, 2880],
  aspect: '1:4',
  refs: [],
  prompt: `${REGION} The region: ${what}.`,
}));

// ---------------------------------------------------------------------------------------------- story backgrounds (12)
const STORY =
  'A tall portrait background for a visual-novel story scene in a mobile fantasy RPG, hand-painted cinematic concept art, atmospheric lighting. The lower third is darker and calmer because a dialogue panel covers it. No characters, no creatures. ' + NO_TEXT;
const stories = [
  ['forest_day', 'a peaceful village at the edge of a lush forest on a bright morning, thatched cottages, smoke from chimneys, birds, golden sunlight through trees'],
  ['forest_mist', 'the same forest village swallowed by an eerie red mist, sinister red light between the trees, dark and unsettling'],
  ['wasteland', 'a grey ash wasteland to the horizon, a caravan trail, hunters guild flags in the wind, dust in the air, hazy sky'],
  ['frostpeak', 'a snowy mountain range under a pale blue sky, a narrow mountain path, blowing snow, cold light'],
  ['frostpeak_lab', 'a hidden research laboratory carved into ice, glass vessels with glowing red crystals, frosty metal pipes, cold blue light with red accents'],
  ['ruins', 'ancient overgrown stone ruins at dusk, huge broken pillars and stairs, moss, faint mist'],
  ['ruins_miasma', 'the same ancient ruins filled with thick red-purple miasma, glowing red crystals growing from cracks, ominous'],
  ['twilight_city', 'a ruined grand city at twilight, tall broken towers, an orange-purple sky, empty streets, drifting ash'],
  ['twilight_tower', 'the foot of a gigantic dark tower in a ruined city, a huge gate, a swirling red-purple sky, lightning in the clouds'],
  ['tower_summit', 'the summit of a colossal tower above the clouds, a circular stone platform, a vast stormy sky with a huge glowing red serpent-ring in the heavens'],
  ['collapse', 'a vast collapsing sanctum, the floor and pillars breaking apart, light pouring through cracks, dust and debris floating, dramatic and bright white-gold'],
  ['dawn', 'a calm peaceful dawn over green hills and a village far below, a golden sunrise, soft pink clouds, hopeful and serene'],
].map(([id, what]) => ({
  id: `story_${id}`,
  group: 'bg_story',
  out: `backgrounds/story_${id}.jpg`,
  mode: 'jpg',
  size: [864, 1536],
  aspect: '9:16',
  refs: ['backgrounds/home.jpg'],
  prompt: `${STORY} The scene: ${what}.`,
}));

// ---------------------------------------------------------------------------------------------- village (buildings x levels, decor)
const ISO =
  'An isometric game building for a mobile base-building game (2:1 dimetric view looking from the front-right, like Clash of Clans or Rise of Kingdoms), hand-painted with clean bold outlines, soft shading, bright saturated colours and tidy detail. ' +
  'The building stands on one flat diamond-shaped (rhombus, 2:1 proportion) ground tile - grass edged with a little earth - and that diamond tile fills the WHOLE WIDTH of the picture: its left and right corners touch the left and right edges and its lowest corner touches the bottom edge. ' +
  'Everything is on a plain pure white background, no shadow outside the tile, no people, no animals. ' + NO_TEXT;

/** [kind, name, footprint hint, six level descriptions] */
const BUILDINGS = [
  ['castle', 'castle', 'a large castle on a big 4x4 tile', [
    'a small humble keep of timber and rough stone with one short tower, a wooden gate and a small red flag',
    'a stone keep with two towers, a stone gate and small blue roofs, a few banners',
    'a proper stone castle with four corner towers, blue conical roofs, an arched gate and a courtyard wall',
    'a grand castle with taller towers, gilded roof trims, many banners and a strong gatehouse',
    'a magnificent castle with golden domes on the towers, white marble walls, gold ornament and royal banners',
    'a legendary royal palace-fortress with golden spires, glowing blue crystals, a shining gold-and-white keep and a faint radiant aura',
  ]],
  ['shop', 'shop', 'a small market shop on a 2x2 tile', [
    'a tiny wooden stall with a striped red-and-white awning and a few crates',
    'a wooden shop with a striped awning, a counter and hanging goods, a small sign',
    'a tidy timber-and-brick shop with a bigger awning, shelves and barrels',
    'a prosperous two-storey shop with a tiled roof, a fine awning, lanterns and display tables',
    'a luxurious merchant store with gold-trimmed roof, banners and stacked goods, a golden coin sign',
    'a legendary grand emporium with gilded roof, glowing gold coin emblem, ornate pillars and treasure on display',
  ]],
  ['market', 'market', 'a big open-air market on a 3x3 tile', [
    'a small cobbled market square with three simple stalls with red, blue and green awnings',
    'a market with four stalls, crates, baskets and a small well',
    'a bustling market with six stalls, banners, barrels and a fountain',
    'a rich market hall with a tiled central pavilion, many stalls and colourful flags',
    'a grand bazaar with a gold-roofed pavilion, stalls with silk canopies and lanterns',
    'a legendary grand bazaar with a golden dome pavilion, glowing lanterns, ornate arches and treasure everywhere',
  ]],
  ['house', 'house', 'a cottage on a 2x2 tile', [
    'a small cosy cottage with a red tiled roof, a chimney and a wooden door',
    'a larger cottage with a red tiled roof, a window box with flowers and a fence',
    'a two-room timber-and-plaster house with a chimney, shutters and a little garden',
    'a handsome two-storey house with a tiled roof, balcony and flower beds',
    'a fine townhouse with a blue slate roof, gold trim, a garden and lanterns',
    'a grand manor house with a gilded roof, an ornate door, a flower garden and a faint warm glow',
  ]],
  ['lumber', 'lumber camp', 'a lumberjack hut on a 2x2 tile', [
    'a small wooden hut with a pile of logs, a tree stump with an axe',
    'a hut with a bigger stack of logs, a saw and a small woodshed',
    'a lumber camp with a sawing frame, log piles and a cart',
    'a sawmill with a water wheel, stacked planks and a cart of logs',
    'a large sawmill with a tiled roof, mechanical saws, lots of timber and flags',
    'a legendary lumber works with a huge water wheel, golden-trimmed roof, glowing enchanted logs',
  ]],
  ['quarry', 'stone quarry', 'a quarry on a 2x2 tile', [
    'a small rocky pit with a few grey stone blocks and a pickaxe',
    'a quarry pit with stacked cut stones and a wooden crane',
    'a deeper quarry with terraced cuts, a hoist crane and a loaded cart',
    'a large quarry with scaffolding, cranes, stacked blocks and rail carts',
    'a great quarry with steel cranes, polished white stone blocks and a small stone workshop',
    'a legendary quarry with giant gilded cranes, glowing white marble blocks and a faint shimmering aura',
  ]],
  ['mine', 'mine', 'a mine entrance on a 3x3 tile', [
    'a rocky hill with a small timber-framed mine entrance and a single rail cart',
    'a rocky hill with a sturdier timber entrance, rails and an ore cart with iron ore',
    'a mine with a stone-and-timber entrance, a lamp, rails and ore carts',
    'a large mine with a smelting forge beside it, chimney smoke, rails and heaps of ore',
    'a great mine complex with a big forge, steel gates, glowing furnaces and ingot stacks',
    'a legendary mine with a golden-trimmed gate, glowing blue ore veins, a huge forge and shining ingots',
  ]],
  ['fence', 'fence', 'a short fence segment on a single 1x1 tile', [
    'two wooden posts with a rough plank rail',
    'a sturdy wooden fence with a double rail and sharpened posts',
    'a wooden fence strengthened with iron bands and pointed stakes',
    'a stone-based fence with iron spikes and metal bands',
    'a tall iron-and-stone palisade fence with spikes and a small banner',
    'a legendary golden-iron palisade with glowing blue runes on the posts',
  ]],
  ['gate', 'gate', 'a defensive gate on a 2x2 tile', [
    'a simple wooden gate between two rough wooden towers',
    'a wooden gate between two stone-footed towers with a small flag',
    'a stone gatehouse with a wooden double door and a tiled roof',
    'a strong stone gatehouse with an iron-banded door, battlements and banners',
    'a fortified gatehouse with tall towers, a portcullis, iron spikes and royal banners',
    'a legendary fortress gate with golden-trimmed towers, a glowing blue rune door and radiant banners',
  ]],
];

const village = BUILDINGS.flatMap(([kind, name, hint, levels]) =>
  levels.map((what, i) => ({
    id: `village_${kind}_${i + 1}`,
    group: 'village',
    out: `village/${kind}_${i + 1}.png`,
    mode: 'cutout',
    size: [640, 640],
    fit: 'trim',
    aspect: '1:1',
    refs: [],
    refPrev: i > 0 ? `village_${kind}_${i}` : undefined,
    prompt:
      `${ISO} The building: a ${name} - ${hint} - at level ${i + 1} of 6: ${what}.` +
      (i > 0 ? ' The first reference picture shows the previous level of the SAME building: keep the same design, colours, angle and footprint and make this one clearly more advanced and richer.' : ''),
  })),
);

const decor = [
  ['tree', 'tree', 'a single round leafy green tree with a sturdy trunk on a small 1x1 grass tile'],
  ['flowers', 'flower bed', 'a small stone-bordered flower bed full of red, yellow and white flowers on a small 1x1 tile'],
  ['fountain', 'fountain', 'a two-tier stone fountain with sparkling water on a 2x2 paved tile'],
  ['statue', 'statue', 'a bronze hero statue holding a raised sword on a stone plinth on a 2x2 paved tile'],
].map(([id, name, what]) => ({
  id: `village_${id}_1`,
  group: 'decor',
  out: `village/${id}_1.png`,
  mode: 'cutout',
  size: [640, 640],
  fit: 'trim',
  aspect: '1:1',
  refs: [],
  prompt: `${ISO} The object: ${name} - ${what}.`,
}));

const construction = [
  {
    id: 'village_construction',
    group: 'decor',
    out: 'village/construction.png',
    mode: 'cutout',
    size: [640, 640],
    fit: 'trim',
    aspect: '1:1',
    refs: [],
    prompt: `${ISO} The object: a building site on a 2x2 tile - bare packed earth with four wooden corner posts, a half-built timber frame, a pile of planks and bricks, scaffolding and a small ladder.`,
  },
];

export const MANIFEST = [...items, ...gear, ...banners, ...screens, ...battles, ...regions, ...stories, ...village, ...decor, ...construction];

/** Approximate price of one picture (USD, 2K) used for the estimate printed before generating. */
export const PRICE_PER_IMAGE = 0.0504;

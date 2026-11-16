// The 80 characters added in 2026-11 to double the roster (81 -> 161). One line each:
//   [id, rarity, heroClass, Japanese name, 'm' | 'f' (decides the voice, tools/audio/manifest.mjs), what the picture shows (English prompt)]
// Read by tools/art/manifest.mjs (the pictures) and tools/audio/manifest.mjs (who speaks); src/game/data/heroes.ts, skills.ts and
// heroLines.ts have the same ids. By rarity x class: the classes the roster was short of (tank, healer, archer) get the most.
// Pictures must not contain writing: no letters, numbers or readable symbols on anything.

export const NEW_CHARACTERS = [
  // ---------------------------------------------------------------- ★5 (6): legendary, a notch below the one ★6
  ['phi', 5, 'warrior', '黄金比の剣聖ファイ', 'f', 'Phi, the Golden-Ratio Swordmaster: an elegant young woman duelist in a white-and-gold armored coat-dress with spiral nautilus-shell engravings on the shoulder plates, a long slender golden saber whose blade bends in a perfect spiral of light, long platinum hair in a high braid with gold ornaments, a cold, composed smile, a crisp golden spiral of light circling her'],
  ['tau', 5, 'warrior', '円環の覇者タウ', 'm', 'Tau, the Conqueror of the Ring: a huge, broad-shouldered knight king in gold-and-silver ring-shaped plate armor with great circular pauldrons, a giant ring-blade greatsword (a huge steel circle with a grip), a long crimson cape, a horned golden crown-helmet with the face visible, short dark hair and a heavy beard, a commanding stare'],
  ['prime', 5, 'archer', '孤高のプライム', 'm', 'Prime, the Lone Sniper: a tall solitary man in a long dark-indigo coat with gold geometric filigree, a high collar, an enormous bow made of solid gold light with a single glowing arrow drawn, silver hair over one eye, a monocle, cold distant eyes, a few floating gold geometric shards around him'],
  ['sigma', 5, 'tank', '総和の女帝シグマ', 'f', 'Sigma, the Empress of Sums: a regal woman in heavy ornate armor built from stacked golden plates, an enormous throne-like tower shield made of layered gold discs, a spear-scepter, a tall jeweled crown, long wavy dark-violet hair, a calm dignified smile, a crimson mantle with gold trim'],
  ['delta', 5, 'archer', '裂界のデルタ', 'm', 'Delta, the Rift Archer: a lean youth in sleek triangular crystal armor of teal and white, a futuristic bow that splits into three glowing blades, a tattered cape that fades into a swirl of light, spiky short silver-blue hair, a triangular crystal visor pushed up on his forehead, a daring grin'],
  ['serafina', 5, 'healer', '癒光の大司教セラフィナ', 'f', 'Serafina, the Archbishop of Healing Light: a majestic woman in layered white-and-gold vestments with a tall ornate mitre, six large feathered wings of white and soft gold, a golden chalice-topped staff, long wavy golden-blonde hair, a kind, serene face, a crisp golden halo and drifting golden petals'],

  // ---------------------------------------------------------------- ★4 (19): strong, impressive
  ['musashi', 4, 'warrior', '二天のムサシ', 'm', 'Musashi, a wandering dual-sword ronin in a worn indigo kimono with a half-open front, a straw hat hanging on his back, two katana drawn in a crossed guard, messy black hair tied up, a scarred cheek, calm sharp eyes'],
  ['hild', 4, 'warrior', '戦乙女のヒルド', 'f', 'Hild, a valkyrie warrior in silver-and-blue plate armor with a winged helmet, small white wings on her back, a long spear and a straight sword, a flowing blue cape, long blonde braids, a fierce proud look'],
  ['shaolan', 4, 'warrior', '蒼龍のシャオラン', 'f', 'Shaolan, a kung-fu fighter woman in a blue-and-gold high-collar martial-arts outfit embroidered with a coiling azure dragon, steel-banded gauntlets, twin buns of black hair with gold pins, a fighting stance with one fist forward, a confident smirk'],
  ['iris', 4, 'mage', '虹彩のイリス', 'f', 'Iris, a prism sorceress in a white robe whose long sleeves shimmer in rainbow gradients, a staff topped with a floating prism crystal that splits light into seven colors, long hair that fades from pink to blue, a bright, playful smile'],
  ['chrono', 4, 'mage', '時計塔のクロノ', 'm', 'Chrono, a time mage in a long navy-and-brass coat covered in clock gears, a tall staff with an hourglass at its tip, floating clock-face rings (no numerals, only tick marks), a top hat with a gear, slicked silver hair, a thoughtful half-smile'],
  ['terra', 4, 'mage', '岩峰のテッラ', 'f', 'Terra, an earth mage woman in an earthy brown-and-green armored robe with stone-crystal gauntlets, floating rock pillars and glowing green gems orbiting her, a staff made of a twisted tree root holding a boulder-like crystal, short messy hair with a flower, a warm confident look'],
  ['somu', 4, 'mage', '夢喰いのソム', 'm', 'Somu, a sleepy dream-eater boy mage in a cozy indigo pajama-like robe with a star-patterned nightcap, a plush tapir-like creature on his shoulder, a staff shaped like a crescent moon with a hanging dream-catcher, half-closed drowsy eyes, soft glowing purple mist'],
  ['nerei', 4, 'mage', '海渦のネレイ', 'f', 'Nerei, a sea sorceress in a shell-and-pearl armored dress of aqua and white, a coral-branch staff, ribbons of living water swirling around her, long sea-green wavy hair with a starfish clip, a mysterious gentle smile'],
  ['hawk', 4, 'archer', '鷹匠のホーク', 'm', 'Hawk, a falconer archer in a green-and-brown hooded cloak with leather bracers, a real hawk perched on his gloved arm, a long composite bow on his back, a feather in his hair, sharp golden eyes, a lean outdoorsman look'],
  ['kreis', 4, 'archer', '重弩のクライス', 'm', 'Kreis, a heavy-crossbow gunner in steampunk gear: brass-and-leather armor with pipes and gauges, a huge repeating crossbow with gears and a bolt magazine, goggles on a scruffy cap, a soot-smudged face, a cocky grin'],
  ['fiora', 4, 'archer', '妖精弓のフィオラ', 'f', 'Fiora, a fairy archer girl with translucent butterfly wings, a small glowing bow made of a curved flower stem, a dress of petals and leaves in pink and green, twin ponytails with flower buds, tiny glowing motes around her, a mischievous smile'],
  ['gran', 4, 'tank', '岩腕のグラン', 'm', 'Gran, a half-giant tank, very tall and broad, in rough stone-plated armor, a boulder-like tower shield with cracks, a stone club, a mossy cloak, shaggy brown hair and a short beard, a gentle, steady face'],
  ['torta', 4, 'tank', '亀甲のトルタ', 'f', 'Torta, a sturdy girl tank in turtle-shell armor: a big hexagon-patterned green shell shield and a shell-like backpack plate, a short sturdy spear, short teal hair with a small turtle-shaped clip, a calm sleepy smile'],
  ['magna', 4, 'tank', '鉄鬼のマグナ', 'm', 'Magna, an iron oni tank: a red-skinned horned giant in black iron plate armor with spikes, a huge studded iron club, a fur loincloth-skirt over armor, a thick mane of white hair, tusks, a cheerful booming laugh'],
  ['fleur', 4, 'healer', '花守のフルール', 'f', 'Fleur, a flower-keeper healer in a petal-layered pink-and-white dress with a green leaf cape, a staff made of a blooming vine with a large flower on top, flower petals swirling, long wavy pink-blonde hair crowned with flowers, a gentle smile'],
  ['shiro', 4, 'healer', '白狐のシロ', 'm', 'Shiro, a white-fox healer boy in a white-and-red shrine-style robe, a white fox mask pushed up on his head, fox ears and a fluffy white tail, a wooden medicine chest on his back, a paper-charm wand, soft glowing foxfire, a kind grin'],
  ['rain', 4, 'healer', '恵雨のレイン', 'f', 'Rain, a rain priestess in a pale-blue-and-silver hooded robe holding a large transparent umbrella-staff, droplets floating and glowing around her, long straight blue hair, calm closed-eyes smile, a few raindrops sparkling'],
  ['weiss', 4, 'healer', '鴉面のヴァイス', 'm', 'Weiss, a plague-doctor healer in a long black coat and wide hat with a white bird-beak mask (eyes visible through round lenses), leather gloves, a bag of vials and a staff with a hanging lantern, white hair tied back, an eerie yet kind look'],
  ['anju', 4, 'healer', '天使のアンジュ', 'f', 'Anju, a junior angel healer girl with a small golden halo, small white feathered wings, a white-and-sky-blue short dress with gold trim, a harp-shaped wand, wavy light-blonde hair with a ribbon, a sweet bright smile'],

  // ---------------------------------------------------------------- ★3 (30): everyday adventurers
  ['dante', 3, 'warrior', '賞金稼ぎのダンテ', 'm', 'Dante, a laid-back bounty hunter man in a long dusty brown coat and a wide-brimmed hat, a straight sword at his hip and a folded wanted-poster-like paper (blank) in his pocket, stubble, a toothpick in his mouth'],
  ['hinata', 3, 'warrior', '道場娘のヒナタ', 'f', 'Hinata, a dojo girl in a white keikogi top and a navy hakama with a headband, a wooden practice sword (bokken) held ready, black hair in a high ponytail, a spirited look'],
  ['ulf', 3, 'warrior', '北海のウルフ', 'm', 'Ulf, a young viking warrior in a fur-trimmed leather armor with a horned iron helmet, a round wooden shield on his back and a big axe, a braided blond beard, a hearty grin'],
  ['cecil', 3, 'warrior', '落ち騎士のセシル', 'm', 'Cecil, a fallen knight in dented, mismatched old armor with a torn tabard, a chipped longsword, messy dark hair, tired but kind eyes'],
  ['leona', 3, 'warrior', '闘技場のレオナ', 'f', 'Leona, an arena gladiator woman with a mane-like golden-brown hair, sand-colored leather armor with bronze plates, a short sword and a small round buckler, tanned skin, a confident grin'],
  ['toro', 3, 'warrior', '紅布のトーロ', 'm', 'Toro, a flamboyant matador-style swordsman in a short embroidered jacket and sash, a red cape in one hand and a thin sword in the other, slicked black hair, a showy smile'],
  ['skadi', 3, 'warrior', '氷原のスカディ', 'f', 'Skadi, a tundra huntress in a white fur-trimmed coat and boots, a spear with a stone head, snow goggles pushed up on her forehead, short pale-blue hair, rosy cheeks, a hardy smile'],
  ['bao', 3, 'warrior', '酔拳のバオ', 'm', 'Bao, a drunken-fist martial artist in a loose, rumpled green robe, a big gourd bottle hanging from his belt, wrapped hands, messy short hair, a rosy tipsy face and a wobbly fighting stance'],
  ['mike', 3, 'mage', '見習い魔女のミケ', 'f', 'Mike, an apprentice witch girl in an oversized black hat and a short purple robe, a broom-handle wand, a calico cat sitting on her shoulder, short orange-brown hair, a clumsy eager smile'],
  ['faust', 3, 'mage', '書庫のファウスト', 'm', 'Faust, a bookish librarian mage in a dark-green robe with many pockets, round glasses, several floating open books around him and a quill-like staff, neat brown hair, a distracted scholarly look'],
  ['kon', 3, 'mage', '狐火のコン', 'f', 'Kon, a fox-spirit girl mage with fox ears and a fluffy tail, a short red-and-cream kimono-style outfit, several small blue foxfire flames floating around her, a paper fan, a sly smile'],
  ['rook', 3, 'archer', '猟犬のルーク', 'm', 'Rook, a hunter man in a brown leather vest and a green hooded cape, a longbow, a quiver, a loyal hound dog standing beside him, short messy hair, a calm, observant look'],
  ['annie', 3, 'archer', '早撃ちのアニー', 'f', 'Annie, a quick-draw frontier sharpshooter girl in a cowgirl hat, a fringed vest and boots, a light lever-action rifle held up, a blonde side braid, a wink and a grin'],
  ['hibari', 3, 'archer', '雲雀のヒバリ', 'f', 'Hibari, a skylark archer girl in a bright yellow-and-white outfit with a short feathered cape, a small short bow, hair in two short pigtails with a feather, a cheerful open-mouth smile as if singing'],
  ['tengri', 3, 'archer', '草原のテンゲル', 'm', 'Tengri, a steppe nomad archer in a thick blue felt coat with embroidered trim and a round fur hat, a recurve bow, a quiver of arrows at his hip, a weathered friendly face'],
  ['isana', 3, 'archer', '銛打ちのイサナ', 'm', 'Isana, a fisherman harpoon thrower in a rolled-up sleeveless sea-green jacket, a coil of rope over his shoulder, a long harpoon launcher, tanned skin, a headband, a broad grin'],
  ['cyril', 3, 'archer', '郵便屋のシリル', 'm', 'Cyril, a courier archer in a postman-style cap and a navy jacket with a big leather satchel stuffed with blank letters, a short bow with an arrow that has a rolled letter tied to it, brown curly hair, an earnest look'],
  ['moss', 3, 'tank', '苔石のモス', 'm', 'Moss, a moss-covered stone golem boy: a round grey stone body with plates, green moss and tiny flowers growing on his shoulders, a big stone slab shield, glowing yellow eyes, a stubby friendly look'],
  ['grete', 3, 'tank', '鍋蓋のグレーテ', 'f', 'Grete, a farm-girl tank in a sturdy apron dress with a huge iron pot lid used as a shield and a heavy frying pan as a weapon, a kerchief over her braided hair, a cheerful, tough look'],
  ['ivan', 3, 'tank', '雪国のイワン', 'm', 'Ivan, a northern guard in a big fur hat and a thick long coat with iron plates, a huge tower shield and a short axe, a big gray moustache, a stern but warm face'],
  ['teo', 3, 'tank', '従騎士のテオ', 'm', 'Teo, a young squire in slightly too-big plain steel armor and a plumed helmet pushed up, an oversized kite shield with a simple emblem, a short sword, sweat on his brow, a determined face'],
  ['amara', 3, 'tank', '砂漠盾のアマラ', 'f', 'Amara, a desert warrior woman in cream wraps and bronze armor pieces, a large round bronze shield with a sun emblem and a short spear, gold bangles, a long black braid, tanned skin, a proud look'],
  ['rhino', 3, 'tank', '突角のライノ', 'm', 'Rhino, a burly man in horned grey iron armor shaped like a rhinoceros with a single big horn on the helmet, a massive shield and a mace, a thick neck, a blunt determined grin'],
  ['ravi', 3, 'tank', '寺院のラヴィ', 'm', 'Ravi, a temple guardian monk in saffron-and-brown robes with bronze shoulder guards, a huge bronze bell used as a shield, a heavy staff, a shaved head with a beaded necklace, a serene face'],
  ['pia', 3, 'healer', '野戦看護のピア', 'f', 'Pia, a field nurse in a white cap and apron over a grey-blue dress with a satchel of bandages, a lantern staff, a short bob of light-brown hair, a brisk caring look'],
  ['hugo', 3, 'healer', '薬酒のユーゴ', 'm', 'Hugo, a plump friendly monk in a brown habit with a rope belt, carrying a big flask of herbal liquor and small cups, a wooden staff with a ladle-like top, a round cheerful face and a bald head'],
  ['lotta', 3, 'healer', '流しのロッタ', 'f', 'Lotta, a wandering bard healer in a patched colorful dress and a feathered cap, a lute with a green gem, glowing soft music-like ribbons of light, long wavy copper hair, a carefree smile'],
  ['sachi', 3, 'healer', '湯治のサチ', 'f', 'Sachi, a hot-spring healer girl in a light-blue yukata with a towel around her neck, a wooden bucket in her hand and a ladle wand, soft steam swirling around her, hair in a bun with a flower pin, a relaxed warm smile'],
  ['owen', 3, 'healer', '森医者のオーウェン', 'm', 'Owen, an old forest doctor in a green leaf-patterned cloak with a satchel of herbs, a gnarled staff, a small owl on his shoulder, a long white beard and kind eyes behind round spectacles'],
  ['tsumugi', 3, 'healer', '針仕事のツムギ', 'f', 'Tsumugi, a seamstress healer in a patchwork apron dress, a needle-like staff with a thread that glows, a sewing basket at her hip, a measuring tape around her neck, hair in a low ponytail with a ribbon, a gentle smile'],

  // ---------------------------------------------------------------- ★2 (15): modest, ordinary
  ['cain', 2, 'warrior', '剣闘見習いのケイン', 'm', 'Cain, a rookie gladiator boy in simple leather chest straps and a plain bronze helmet, a short sword and a small wooden shield, short spiky hair, an eager look'],
  ['nene', 2, 'warrior', '棒術のネネ', 'f', 'Nene, a staff-fighter girl in a simple cream tunic with a belt and arm wraps, a long wooden staff held across her body, hair in two buns, a lively smile'],
  ['tobi', 2, 'mage', '魔法学生のトビ', 'm', 'Tobi, a school-uniform boy mage in a navy blazer, shorts and a short cape, a small wand, a satchel, messy dark hair, a nervous but earnest face'],
  ['nel', 2, 'mage', '雪だるまのネル', 'f', 'Nel, a snow-mage girl in a woolly scarf, mittens and a fluffy white coat, a small snowman riding on her staff, short silver hair, rosy cheeks, a shy smile'],
  ['sparky', 2, 'mage', '発明家のスパーク', 'm', 'Sparky, a young inventor in goggles and a patched lab coat with tool pouches, a spark-throwing wand made of a wire coil, wild static hair, a gleeful grin'],
  ['mugi', 2, 'archer', '麦畑のムギ', 'f', 'Mugi, a farm girl in a straw hat and overalls with a plain apron, a simple short bow made of a bent branch, a small quiver, freckles, a wheat stalk in her mouth'],
  ['kei', 2, 'archer', '少年狩人のケイ', 'm', 'Kei, a young hunter boy in a simple green tunic and leather cap with a small bow and a rabbit-fur collar, tousled hair, an alert face'],
  ['lily', 2, 'archer', '羊飼いのリリー', 'f', 'Lily, a shepherd girl in a simple blue dress with a shawl, a slingshot and a shepherd crook, a small lamb at her feet, long light braids, a gentle look'],
  ['dote', 2, 'tank', '門番のドテ', 'm', 'Dote, a town gatekeeper in a plain padded jerkin and a dented helmet, a wooden town-gate-door shield and a short club, a round honest face, a firm stance'],
  ['kuma', 2, 'tank', '熊頭巾のクマ', 'f', 'Kuma, a girl in a bear-fur hood with round ears and a brown fur-trimmed tunic, a small round wooden shield and a wooden club, a sturdy short build, a determined pout'],
  ['hank', 2, 'tank', '木こりのハンク', 'm', 'Hank, a lumberjack man in a red-checkered flannel shirt, suspenders and heavy boots, a log-slab shield and a felling axe, a thick brown beard, a broad friendly smile'],
  ['bell', 2, 'tank', '鐘つきのベル', 'f', 'Bell, a bell-ringer girl in a simple grey-and-white tunic carrying a big dented iron handbell as a shield and a wooden mallet, short bobbed hair, a stout, steady stance'],
  ['hana', 2, 'healer', '花売りのハナ', 'f', 'Hana, a flower-seller girl in a plain apron dress with a basket of flowers on her arm, a headscarf, small petals floating, a warm hopeful smile'],
  ['miel', 2, 'healer', '蜂蜜のミエル', 'f', 'Miel, a beekeeper girl in a pale-yellow smock with a net veil pushed back, a honey jar and a small honey-dipper wand, a little bee hovering beside her, short honey-blonde hair'],
  ['tomo', 2, 'healer', '小司祭のトモ', 'm', 'Tomo, a young priest boy in a white robe whose sleeves are too long, a small wooden holy-symbol staff, round cheeks, soft brown hair, an earnest, shy look'],

  // ---------------------------------------------------------------- ★1 (10): beginners
  ['nuts', 1, 'archer', '投石のナッツ', 'm', 'Nuts, a village boy in plain shirt and shorts with a big slingshot and a pouch of pebbles, a patched cap, scraped knees, a mischievous grin'],
  ['rie', 1, 'archer', '森の少女リエ', 'f', 'Rie, a forest village girl in a plain green tunic and boots with a very simple short bow and a few arrows in a cloth quiver, hair in a messy ponytail, a shy smile'],
  ['taka', 1, 'archer', '見習い猟師のタカ', 'm', 'Taka, an apprentice hunter boy in a plain brown vest with a hand-made bow, a rope belt, a feather hat that is too big, a determined look'],
  ['don', 1, 'tank', '木盾のドン', 'm', 'Don, a stocky village boy with a plain wooden barrel-lid shield and a wooden club, a cloth cap, simple tunic, a proud puffed chest'],
  ['rock', 1, 'tank', '石頭のロック', 'm', 'Rock, a boy with a thick clay-pot helmet on his head and a plain wooden plank shield, a ragged tunic, a stubborn, tough grin'],
  ['pam', 1, 'tank', '見習い門番のパム', 'f', 'Pam, a young trainee gate guard girl in an oversized dented helmet and plain padded jacket, a tiny wooden shield and a short stick, a nervous but brave face'],
  ['yomo', 1, 'healer', '薬草摘みのヨモ', 'f', 'Yomo, a herb-picking village girl in a simple apron and headscarf with a woven basket full of green herbs, hair in two small braids, a cheerful smile'],
  ['mio', 1, 'healer', '見習い僧のミオ', 'f', 'Mio, an acolyte girl in a plain white novice robe with a rope belt and a small wooden prayer-bead bracelet, a short bob haircut, folded hands, a gentle, earnest face'],
  ['tiko', 1, 'mage', '見習い魔法使いのティコ', 'm', 'Tiko, an apprentice wizard boy in an oversized pointed hat that covers his eyes a little and a plain grey robe too long for him, a small crooked stick wand, a hopeful grin'],
  ['ryo', 1, 'warrior', '木刀のリョウ', 'm', 'Ryo, a village boy in a plain tunic with a headband, a wooden practice sword, scraped elbows, a spirited expression'],
];

/** Rarity x class totals, for the console. */
export function tally() {
  const t = {};
  for (const [, r, c] of NEW_CHARACTERS) t[`${r}${c}`] = (t[`${r}${c}`] ?? 0) + 1;
  return t;
}

import type { DataTexts } from '../dataTexts';

/** English of data/storyScript.ts: the story of the Quest campaign, line by line. One row = a script id and its lines in the order of the
 *  Japanese (a line is found by "<script id>.<number>", the number starting at 1; the speaker is looked up by his or her Japanese name in
 *  `storySpeaker`). The words of the world are those of the rest of the English: the Commander (the player), Luri (the crow), the
 *  Professor, the Factor, the Symbiosis Institute, the Hunters' Guild, the five regions and the Tower of Frenzy (docs/I18N.md, glossary).
 *  Luri talks lightly; the Guild Master is blunt; the Professor is cold and exact. */
const SCRIPTS: Record<string, string[]> = {
  // ---- the first launch
  opening_story: [
    'On the edge of the Lost Forest stood a village where the Commander and a crow partner lived in peace.',
    'Every morning the birds sang, and the animals of the forest grazed calmly around the village.',
    '—Until that day.',
  ],
  opening_rampage: [
    'One morning, a red mist drifted in from deep within the forest.',
    'The animals that breathed it in began to glow red-eyed, one after another.',
    'They bared their fangs, howled, and attacked even their own kind. The forest was swallowed by screams.',
  ],
  opening_talk: [
    'Beside the frightened Commander, only the crow partner stayed, just as always.',
    '...Hey, Commander. Can you hear me?',
    "I can talk... I can actually talk now!",
    "I don't know why. But I'm the only one who can put what's happening in this forest into words.",
    "So I'll teach you, Commander. How to fight, that is. From here on, I've got your back!",
  ],

  // ---- region 1: the Lost Forest
  forest_intro: [
    'One day the birdsong stopped completely.',
    'Deep in the Lost Forest, a red mist no one had ever seen hung over the village where the Commander lived.',
    "...Hey, something's wrong. All the animals in the forest have glowing red eyes.",
    "I've been in this forest with you the whole time... so why am I the only one who's fine?",
    "Ah, no time to wonder about that. Anyway, being able to talk is pretty convenient, right?!",
    "Commander, are you listening? —I'm the only one who can tell you, in actual words, what's about to happen.",
    'One by one, the beasts of the forest lost their reason. The cause was unknown. Only one thing was certain—this was "the beginning."',
    "Run away? No, that's not it. Your eyes are already set, Commander.",
    "Then it's settled. I'm in, too. All the way to the end.",
    'Luri the crow and the Commander—the journey of an odd pair of partners begins here.',
  ],
  forest_outro: [
    "Deep in the forest—when the last beast was driven back, Luri's wings quivered as if the crow had noticed something.",
    "This red miasma runs beyond the forest, too... It looks like it's riding the wind and drifting on forever.",
    "Which means this isn't just a forest problem.",
    'Standing at the edge of the village, they saw a gray wasteland stretching to the horizon. The smell of miasma had certainly reached there, too.',
    "—We have to go, don't we. Until we find the cause, there probably isn't a safe place anywhere.",
    "Commander, you're coming with me to the wasteland, right? A long trip on these wings is a bit scary on my own.",
    'Leaving the Lost Forest behind, the two set out for the Ashen Wasteland.',
  ],

  // ---- region 2: the Ashen Wasteland
  wasteland_intro: [
    "A wasteland swirling with gray dust. Caravan wagons stood in a line, and the banner of the Hunters' Guild fluttered in the wind.",
    "Another new face. ...Came from the forest? Then this will be quick. The beasts out here in the wasteland are baring their fangs, too.",
    "I knew it wasn't just the forest. So is this something that's happening naturally?",
    'No. We have watched the beasts in this wasteland for years. This is the work of something touched by human hands.',
    'From wounds that a bite leaves but does not kill, we find strange red crystals. We call them the "Frenzy Factor."',
    'The Frenzy Factor... So someone is scattering it around?',
    "Who knows. But rumor has it that if you trace it back to its source, there's something in the mountains. There should be an old facility.",
    "Commander, did you hear that? The mountains... I guess we have to go.",
    'Driving back the beasts of the wasteland, the two began to trace the Factor to its source.',
  ],
  wasteland_outro: [
    "You've held out well this far. ...If you're heading for the peaks, take this. It's an old map.",
    'It says "Symbiosis Institute"... That was an organization that studied how animals and humans could live together, right?',
    'Yes. It should have disbanded long ago... but they say the remains of the facility are still deep in the mountains.',
    'The source of the Factor might be there.',
    'Crossing the wasteland, the two headed for the Azure Frost Peaks.',
  ],

  // ---- region 3: the Azure Frost Peaks
  frostpeak_intro: [
    'Peaks towering through a blizzard. Beyond a ridge frozen white, the outline of a crumbling facility came into view.',
    "Is that... what's left of the Symbiosis Institute? Way out here in the mountains.",
    'On the wall of the facility hung a faded sign—"Aiming for True Coexistence Between Animals and Humans."',
    '"True coexistence," huh... That sounds like the exact opposite of what\'s going on now.',
    'Deep inside the facility, there was a feeling that something was still alive.',
    "There should have been someone at the top of this institute... but their name isn't left anywhere in the facility.",
    'But the people who used to work here all called that person the same thing, apparently. "The Professor."',
    "The Professor... Commander, I'm sure we'll find something connected to that person deep in this facility.",
  ],
  frostpeak_outro: [
    'In the deepest part of the facility, a collapsed lab, well-worn experiment records were piled up like a mountain.',
    "This... it's a log of culturing the Factor. The dates keep getting more recent. Which means—it's still going on somewhere, even now.",
    'A map was tucked into the last page of the records. It pointed farther south—to an old ruin.',
    'The ruins... The Professor might be there right now.',
    "Commander, there's no turning back now that we've come this far. —You're still going, right?",
    'Crossing the Azure Frost Peaks, the two headed for the Miasma Ruins.',
  ],

  // ---- region 4: the Miasma Ruins
  ruins_intro: [
    'The closer they got to the ruins, the heavier the air grew, and a dark red miasma crept along the ground.',
    "...Ugh, it's thick. The miasma here is nothing like before.",
    "Are you okay, Commander? I'm... a little foggy in the back of my head.",
    'The Professor is in the deepest part of the ruins. With that conviction as their only guide, the two stepped into the depths of the miasma.',
    "—I'm fine. We've come this far, so I'll stay with you to the end.",
  ],
  ruins_outro: [
    'The innermost chamber of the ruins—at the center of a room where dark red miasma swirled, stood a single shadow.',
    '...Another one has made it here. I wonder how many have come this deep, counting you.',
    'Are you... the Professor?',
    'Now, how should I answer that? Whatever the case, I am certainly the "answer" you have chased all this way.',
    'Coexistence between animals and humans—that is an illusion. True coexistence means complete control through the Factor.',
    "Control...? That's just domination! All you're doing is driving the beasts mad!",
    'I am not driving them mad. I am "liberating" them. From the chains called reason.',
    'At those words, the miasma filling the room swirled and surged toward Luri.',
    'Luri—!',
    '...Ngh... ah...',
    'The color drained from Luri\'s eyes, and as if having lost the power of speech, the crow could only tremble, wings stiff.',
    'Oh? ...So you are the one specimen that did not go mad even after taking the Factor into its body. Fascinating. What is holding you back?',
    'Instead of answering, the Commander gently reached out as if to shield Luri.',
    "—After a while, light slowly returned to Luri's eyes.",
    "...Huh? Commander...? Sorry, I think I kind of zoned out for a second.",
    '...You are back. ...Interesting. But it will be worth watching how long that lasts.',
    'The Professor said no more and vanished into the depths of the miasma. All that remained was a heavy silence.',
    "...Commander. I'm fine. If anything—I will never accept what that guy said.",
    'Leaving the Miasma Ruins behind, the two hurried to Twilight City, where the Professor was said to have scattered the Factor.',
  ],

  // ---- region 5: Twilight City
  twilight_intro: [
    'A city dyed in twilight—everywhere beasts rampaged and people fled in panic.',
    'This is awful... The Professor has already scattered the Factor all the way here.',
    'From the tower rising at the heart of the city, dark red miasma billowed up without end.',
    "That tower... the Professor must be there. They might be planning to take key figures hostage and rule the city.",
    "Commander, every beast we take down here means more people who can escape. Let's start with what we can do.",
    'The two raced through the chaotic city, carving out a path to the tower.',
  ],
  twilight_outro: [
    'The miasma that had covered the city finally began to clear. Nothing stood in the way to the tower entrance now.',
    "We made it this far... The Professor is at the top of the tower.",
    "Commander. —There's no backing out from here. Let's see it through to the very end.",
    'The "Tower of Frenzy." The two stepped into the place where the Factor was born.',
  ],

  // ---- the final battle
  final_intro: [
    'The innermost chamber of the tower. At the center of a hall swirling with dark red miasma, the Professor stood.',
    'So you made it this far. —But I have no need to fight myself.',
    'After all, I can liberate as many Factor-filled beasts as I please.',
    'As the Professor raised a hand, the presence of frenzied beasts rose one after another from the surrounding miasma.',
    "Here they come, Commander...! No matter how many, we stop them here!",
    'A futile resistance. ...No, do as you please. I only hope it makes for a finish worth watching.',
  ],

  // ---- the ending
  ending: [
    'The last roar faded, and silence settled over the tower.',
    'The Professor vanished into the depths of the collapsing miasma. Alive, or else—no one could say.',
    '...Is it over, I wonder?',
    'The facility was slowly beginning to crumble. But the Factor had already been scattered among wild animals all over the world.',
    "Hey, Commander. There's something I've been thinking about this whole time.",
    "Why was I the only one who didn't go mad even after being hit by the Factor? ...I don't think it's about having some resistance or anything like that.",
    "It must be because I was with you, Commander. —With a bond, you can resist even the Factor.",
    'The Professor said "control through the Factor is true coexistence," but... that\'s wrong. The real answer was simple all along.',
    'Luri laughed, still in human words, just as before.',
    "But there are still frenzied beasts all over the world. ...Our journey isn't over, is it.",
    "Then let's go. Face every last one of them properly. —This time, our way.",
    'The journey of the Commander and Luri goes on, in a new form.',
  ],

  // ---- extra: a line of introduction to each region's aftermath
  extra_forest: [
    'In the Lost Forest, beasts driven wild by the Factor still remain.',
    "The toughest one in this forest is... that rumored giant stag, right? Commander, let's go finish the job.",
  ],
  extra_wasteland: [
    'In the wasteland, too, the territories of beasts possessed by the Factor remained.',
    "The Scorpion Queen, was it? The frenzied beast most feared in the wasteland. Let's take her out.",
  ],
  extra_frostpeak: [
    'At the Azure Frost Peaks, around the ruins of the old institute, the presence of frenzied beasts lingers.',
    "The white tiger that used to be the king of the mountain... looks like it's still awake.",
  ],
  extra_ruins: [
    'In the Miasma Ruins, remnants of the old Factor the Professor cultivated still swirl.',
    "That dragon is nothing but bones, but it's weirdly lively... Let's go, Commander.",
  ],
  extra_twilight: [
    'Twilight City also has frenzied beasts left behind, still rampaging.',
    "They say no one has been able to stop that giant wolf that ran all over the city. Let's settle it ourselves.",
  ],
};

/** `{ "<script id>.<n>": { text } }`, n counted from 1 (the key `localized('story', ...)` in data/storyScript.ts asks for). */
const story: Record<string, Record<string, string>> = {};
for (const [id, lines] of Object.entries(SCRIPTS)) lines.forEach((text, i) => (story[`${id}.${i + 1}`] = { text }));

export const storyEn: DataTexts = {
  story,
  // the name on the plate over a line, by the Japanese the story data uses as the speaker
  storySpeaker: {
    ルリ: { name: 'Luri' },
    教授: { name: 'Professor' },
    猟師ギルド長: { name: 'Guild Master' },
    '???': { name: '???' },
  },
};

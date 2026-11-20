import type { Part } from '../types';

// English messages: tutorial.* (typed against ja/tutorial.ts: a missing or extra key is a compile error)
export const tutorial: Part<'tutorial'> = {
  // TutorialOverlay.ts
  'tutorial.overlay.tapGlow': 'Tap the glowing spot',
  'tutorial.overlay.reallySkip': 'Really skip?',
  // TutorialDirector.ts
  'tutorial.done.village': 'Village Tutorial Complete!',
  'tutorial.done.main': 'Tutorial Complete!',
  'tutorial.done.villageNote': 'From Luri: Good luck building your village!',
  'tutorial.done.mainNote': 'From Luri: Great work! Looking forward to more adventures together.',
};

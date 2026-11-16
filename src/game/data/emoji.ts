/** The in-game emoji: the only pictures a chat message may contain. Each is
 *  drawn from code (see ui/EmojiIcons.ts) and written in a message as
 *  `:id:`, e.g. "ありがとう:heart:". Add one here AND in EmojiIcons. */
export const GAME_EMOJI_IDS = [
  'smile',
  'laugh',
  'wink',
  'cool',
  'surprise',
  'sad',
  'cry',
  'angry',
  'heart',
  'star',
  'fire',
  'sword',
  'shield',
  'gem',
  'coin',
  'crown',
] as const;

export type EmojiId = (typeof GAME_EMOJI_IDS)[number];

const IDS: ReadonlySet<string> = new Set(GAME_EMOJI_IDS);

export function isEmojiId(id: string): id is EmojiId {
  return IDS.has(id);
}

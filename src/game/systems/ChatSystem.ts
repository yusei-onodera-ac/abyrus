import type { ChatMessage, ChatState, SaveData } from './SaveSystem';
import { isEmojiId, type EmojiId } from '../data/emoji';
import { SEED_CHAT } from '../data/socialSeed';

export const SELF_ID = 'self';
export const SYSTEM_ID = 'system';
export const GLOBAL_CHANNEL = 'global';
export const dmChannel = (friendId: string): string => `dm:${friendId}`;
export const groupChannel = (groupId: string): string => `group:${groupId}`;

/** Longest message, in characters as typed (an emoji code like ":heart:" counts as 7). */
export const MAX_TEXT = 100;
const MAX_PER_CHANNEL = 200;

/** Everything a chat message may NOT contain: Unicode emoji and pictographs
 *  (the in-game emoji are the only pictures allowed), joiners/modifiers, and
 *  control characters. Ordinary symbols like ★ ♪ ※ → are fine. */
const FORBIDDEN = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\u{1F1E6}-\u{1F1FF}‍︎️⃣\p{Cc}\p{Cf}]/gu;

/** Cleans what a player typed into a sendable message: line breaks become
 *  spaces, OS emoji are dropped, and it is cut to MAX_TEXT. */
export function sanitizeText(raw: string): string {
  const cleaned = raw.replace(/\s+/g, ' ').replace(FORBIDDEN, '').trim();
  return Array.from(cleaned).slice(0, MAX_TEXT).join('').trim();
}

/** Removes only what a message may not contain - for tidying the text box as
 *  the player types, where trimming or truncating would fight their typing. */
export function stripForbidden(raw: string): string {
  return raw.replace(FORBIDDEN, '');
}

/** A message as one plain line for a list preview (emoji become [絵文字]). */
export function plainPreview(text: string): string {
  return text.replace(/:([a-z0-9_]+):/g, (whole, id: string) => (isEmojiId(id) ? '[絵文字]' : whole));
}

export type ChatPart = { kind: 'text'; text: string } | { kind: 'emoji'; id: EmojiId };

/** Splits a message into plain text and in-game emoji (`:id:` for a known id;
 *  an unknown `:word:` stays as text). */
export function parseParts(text: string): ChatPart[] {
  const parts: ChatPart[] = [];
  let last = 0;
  for (const match of text.matchAll(/:([a-z0-9_]+):/g)) {
    if (!isEmojiId(match[1])) continue;
    const at = match.index ?? 0;
    if (at > last) parts.push({ kind: 'text', text: text.slice(last, at) });
    parts.push({ kind: 'emoji', id: match[1] });
    last = at + match[0].length;
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) });
  return parts;
}

let counter = 0;
const nextId = (now: number): string => `${now}-${counter++}`;

/** Local-only chat: messages live in the save. There is no server yet, so the
 *  only other voices are the placeholder lines in data/socialSeed.ts; a real
 *  backend would feed `messages` and replace `send`. */
export const ChatSystem = {
  createDefaultState(now: number): ChatState {
    const messages: ChatMessage[] = SEED_CHAT.map((line) => ({
      id: nextId(now),
      channel: line.channel === 'global' ? GLOBAL_CHANNEL : dmChannel(line.channel.friendId),
      senderId: line.senderId,
      senderName: line.senderName,
      text: line.text,
      sentAt: now - line.agoMs,
    }));
    return { messages };
  },

  messagesOf(save: SaveData, channel: string): ChatMessage[] {
    return save.chat.messages.filter((m) => m.channel === channel).sort((a, b) => a.sentAt - b.sentAt);
  },

  lastMessage(save: SaveData, channel: string): ChatMessage | undefined {
    const list = this.messagesOf(save, channel);
    return list[list.length - 1];
  },

  /** The single most recent message across every channel (全体, every 軍団,
   *  every friend DM) - for the Home screen's always-on preview. */
  latestMessage(save: SaveData): ChatMessage | undefined {
    return save.chat.messages.reduce<ChatMessage | undefined>((latest, m) => (!latest || m.sentAt > latest.sentAt ? m : latest), undefined);
  },

  /** Appends a message from the player. Null (nothing sent) if it is empty
   *  once cleaned, or the channel isn't one the player can post in. */
  send(save: SaveData, channel: string, raw: string, now = Date.now()): ChatMessage | null {
    const text = sanitizeText(raw);
    if (!text) return null;
    const known =
      channel === GLOBAL_CHANNEL ||
      save.social.friends.some((f) => dmChannel(f.id) === channel) ||
      save.social.groups.some((g) => groupChannel(g.id) === channel);
    if (!known) return null;
    const message: ChatMessage = { id: nextId(now), channel, senderId: SELF_ID, senderName: save.playerName, text, sentAt: now };
    save.chat.messages.push(message);
    // Keep each channel's history bounded.
    const mine = save.chat.messages.filter((m) => m.channel === channel);
    if (mine.length > MAX_PER_CHANNEL) {
      const drop = new Set(mine.sort((a, b) => a.sentAt - b.sentAt).slice(0, mine.length - MAX_PER_CHANNEL).map((m) => m.id));
      save.chat.messages = save.chat.messages.filter((m) => !drop.has(m.id));
    }
    return message;
  },
};

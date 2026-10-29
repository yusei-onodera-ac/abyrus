/**
 * PLACEHOLDER social data for a brand-new save. There is no server yet, so
 * there are no real other players: these stand in for friends, a pending
 * request and a few chat lines so the Friend and Message screens have
 * something to show. Delete the entries (or empty the arrays) to start a save
 * with no friends at all. `agoMs` is how long before the save was created
 * the thing happened.
 */
const HOUR = 3_600_000;
const DAY = 86_400_000;

export interface SeedPerson {
  /** 8-character friend ID (see SocialSystem.normalizePlayerId). */
  id: string;
  name: string;
  level: number;
}

export const SEED_FRIENDS: (SeedPerson & { lastLoginAgoMs: number; addedAgoMs: number })[] = [
  { id: 'K7M4RN2X', name: 'リン', level: 12, lastLoginAgoMs: 2 * HOUR, addedAgoMs: 9 * DAY },
  { id: 'H3QWT9BC', name: 'カイ', level: 8, lastLoginAgoMs: 1 * DAY, addedAgoMs: 4 * DAY },
  { id: 'P6ZD8FJY', name: 'ミオ', level: 15, lastLoginAgoMs: 5 * DAY, addedAgoMs: 20 * DAY },
];

export const SEED_INCOMING: (SeedPerson & { sentAgoMs: number })[] = [{ id: 'C2VGX5LE', name: 'ソラ', level: 5, sentAgoMs: 3 * HOUR }];

/** Chat lines already in the log. senderId 'system' is the operator. */
export const SEED_CHAT: { channel: 'global' | { friendId: string }; senderId: string; senderName: string; text: string; agoMs: number }[] = [
  { channel: 'global', senderId: 'system', senderName: '運営', text: '全体チャットへようこそ！みんなで楽しく遊びましょう:star:', agoMs: 2 * HOUR },
  { channel: 'global', senderId: 'system', senderName: '運営', text: '誹謗中傷や迷惑行為はおやめください。', agoMs: 2 * HOUR - 60_000 },
  { channel: { friendId: 'K7M4RN2X' }, senderId: 'K7M4RN2X', senderName: 'リン', text: 'フレンドになってくれてありがとう！よろしくね:smile:', agoMs: 9 * DAY },
];

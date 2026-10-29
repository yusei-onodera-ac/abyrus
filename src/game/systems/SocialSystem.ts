import type { Friend, FriendRequest, Group, GiftReward, SaveData, SocialState } from './SaveSystem';
import { dmChannel, groupChannel } from './ChatSystem';
import { SEED_FRIENDS, SEED_INCOMING } from '../data/socialSeed';

export const MAX_FRIENDS = 30;
/** Cap on requests waiting either way (received, and sent without an answer). */
export const MAX_PENDING = 20;
export const MAX_GROUPS = 5;
/** Friends in one 軍団 (the player makes it 11 with themself). */
export const MAX_GROUP_FRIENDS = 10;
export const GROUP_NAME_MAX = 10;

/** What a friend gets when the player sends them a present - free to send,
 *  once per friend per day. */
export const FRIEND_GIFT: { reward: GiftReward; label: string } = { reward: { type: 'gold', amount: 100 }, label: 'ゴールド ×100' };

// No I/O/0/1 so an ID read aloud or off a screenshot can't be mistyped.
const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ID_LENGTH = 8;

/** A fresh friend ID for this player, e.g. "K7M4RN2X". */
export function generatePlayerId(): string {
  const bytes = new Uint8Array(ID_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join('');
}

/** "K7M4RN2X" -> "K7M4-RN2X" */
export function formatPlayerId(id: string): string {
  return `${id.slice(0, 4)}-${id.slice(4)}`;
}

/** The canonical 8-character ID for what a player typed (case, spaces and
 *  hyphens ignored), or null if it isn't a valid ID. */
export function normalizePlayerId(input: string): string | null {
  const id = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (id.length !== ID_LENGTH) return null;
  return Array.from(id).every((c) => ID_ALPHABET.includes(c)) ? id : null;
}

/** An ID from either a bare ID or a pasted share link (…?friend=ID). */
export function parseFriendInput(text: string): string | null {
  const trimmed = text.trim();
  const fromLink = /[?&]friend=([A-Za-z0-9-]+)/.exec(trimmed);
  return normalizePlayerId(fromLink ? fromLink[1] : trimmed);
}

/** The link that opens this game and offers to send `id` a friend request. */
export function shareLink(id: string): string {
  return `${location.origin}${location.pathname}?friend=${id}`;
}

export type RequestResult =
  | { ok: true; accepted: boolean }
  | { ok: false; reason: 'invalid' | 'self' | 'already_friend' | 'already_requested' | 'friends_full' | 'too_many_requests' };

/** A local-day key, so "once a day" resets at the player's midnight. */
const dayKey = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

export const SocialSystem = {
  /** A new save's social state: its own ID plus the placeholder people from
   *  data/socialSeed.ts. */
  createDefaultState(now: number): SocialState {
    return {
      playerId: generatePlayerId(),
      friends: SEED_FRIENDS.map((f) => ({ id: f.id, name: f.name, level: f.level, addedAt: now - f.addedAgoMs, lastLoginAt: now - f.lastLoginAgoMs, favorite: false })),
      incoming: SEED_INCOMING.map((r) => ({ id: r.id, name: r.name, level: r.level, sentAt: now - r.sentAgoMs })),
      outgoing: [],
      groups: [],
      giftSentDay: {},
    };
  },

  // --- requests ---------------------------------------------------------

  /** Sends a request to whoever `rawInput` (an ID or share link) names. With
   *  no server it just queues in `outgoing`; if that person had already asked
   *  us, the two requests meet and they become a friend straight away. */
  sendRequest(state: SocialState, rawInput: string, now = Date.now()): RequestResult {
    const id = parseFriendInput(rawInput);
    if (!id) return { ok: false, reason: 'invalid' };
    if (id === state.playerId) return { ok: false, reason: 'self' };
    if (state.friends.some((f) => f.id === id)) return { ok: false, reason: 'already_friend' };
    if (state.outgoing.some((r) => r.id === id)) return { ok: false, reason: 'already_requested' };
    if (state.incoming.some((r) => r.id === id)) {
      return this.acceptRequest(state, id, now) ? { ok: true, accepted: true } : { ok: false, reason: 'friends_full' };
    }
    if (state.friends.length >= MAX_FRIENDS) return { ok: false, reason: 'friends_full' };
    if (state.outgoing.length >= MAX_PENDING) return { ok: false, reason: 'too_many_requests' };
    state.outgoing.push({ id, name: '', level: 0, sentAt: now });
    return { ok: true, accepted: false };
  },

  /** False (no change) if there's no such request or the friend list is full. */
  acceptRequest(state: SocialState, id: string, now = Date.now()): boolean {
    const request = state.incoming.find((r) => r.id === id);
    if (!request || state.friends.length >= MAX_FRIENDS) return false;
    state.incoming = state.incoming.filter((r) => r.id !== id);
    state.friends.push({ id, name: request.name, level: request.level, addedAt: now, lastLoginAt: now, favorite: false });
    return true;
  },

  declineRequest(state: SocialState, id: string): void {
    state.incoming = state.incoming.filter((r) => r.id !== id);
  },

  cancelRequest(state: SocialState, id: string): void {
    state.outgoing = state.outgoing.filter((r) => r.id !== id);
  },

  // --- friends ----------------------------------------------------------

  /** Favorites first, then the most recently active. */
  sortedFriends(state: SocialState): Friend[] {
    return [...state.friends].sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.lastLoginAt - a.lastLoginAt);
  },

  toggleFavorite(state: SocialState, id: string): boolean {
    const friend = state.friends.find((f) => f.id === id);
    if (!friend) return false;
    friend.favorite = !friend.favorite;
    return friend.favorite;
  },

  /** Removes a friend and everything tied to them: their DM history, their
   *  place in any 軍団 (one left with nobody else is dissolved), the gift record. */
  removeFriend(save: SaveData, id: string): void {
    const state = save.social;
    state.friends = state.friends.filter((f) => f.id !== id);
    delete state.giftSentDay[id];
    for (const group of state.groups) group.memberIds = group.memberIds.filter((m) => m !== id);
    for (const group of state.groups.filter((g) => g.memberIds.length === 0)) this.deleteGroup(save, group.id);
    save.chat.messages = save.chat.messages.filter((m) => m.channel !== dmChannel(id));
  },

  // --- presents ---------------------------------------------------------

  canSendGift(state: SocialState, friendId: string, now = Date.now()): boolean {
    return state.friends.some((f) => f.id === friendId) && state.giftSentDay[friendId] !== dayKey(now);
  },

  /** Records today's present to a friend; null if they're not a friend or
   *  already got one today. (Delivery to them needs the server.) */
  sendGift(state: SocialState, friendId: string, now = Date.now()): GiftReward | null {
    if (!this.canSendGift(state, friendId, now)) return null;
    state.giftSentDay[friendId] = dayKey(now);
    return FRIEND_GIFT.reward;
  },

  // --- 軍団 (a chat group of friends) -----------------------------------

  defaultGroupName(groups: Group[]): string {
    const taken = new Set(groups.map((g) => g.name));
    for (let n = 1; ; n++) {
      const name = `軍団${n}`;
      if (!taken.has(name)) return name;
    }
  },

  createGroup(save: SaveData, name: string, memberIds: string[], now = Date.now()):
    | { ok: true; group: Group }
    | { ok: false; reason: 'no_members' | 'too_many_members' | 'too_many_groups' } {
    const state = save.social;
    const ids = Array.from(new Set(memberIds)).filter((id) => state.friends.some((f) => f.id === id));
    if (ids.length === 0) return { ok: false, reason: 'no_members' };
    if (ids.length > MAX_GROUP_FRIENDS) return { ok: false, reason: 'too_many_members' };
    if (state.groups.length >= MAX_GROUPS) return { ok: false, reason: 'too_many_groups' };
    const trimmed = Array.from(name.trim()).slice(0, GROUP_NAME_MAX).join('');
    const group: Group = { id: `g${now.toString(36)}${state.groups.length}`, name: trimmed || this.defaultGroupName(state.groups), memberIds: ids, createdAt: now };
    state.groups.push(group);
    return { ok: true, group };
  },

  /** Dissolves a 軍団 together with its chat history. */
  deleteGroup(save: SaveData, id: string): void {
    save.social.groups = save.social.groups.filter((g) => g.id !== id);
    save.chat.messages = save.chat.messages.filter((m) => m.channel !== groupChannel(id));
  },

  /** Display name for something that may not have one yet (a request sent by ID). */
  displayName(person: FriendRequest | Friend): string {
    return person.name || `ID ${formatPlayerId(person.id)}`;
  },
};

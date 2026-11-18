import type { ja } from './ja';

/** Every message key (flat, namespaced "screen.thing": `home.idle.title`). Japanese is the source of truth. */
export type MessageKey = keyof typeof ja;

/** A complete translation: a key missing here is a compile error. */
export type Messages = Record<MessageKey, string>;

/** The keys of one namespace (the part file `en/<NS>.ts` is typed with this, so a missing or extra key is an error right there). */
export type Part<NS extends string> = { [K in MessageKey as K extends `${NS}.${string}` ? K : never]: string };

type Placeholders<S extends string> = S extends `${string}{${infer P}}${infer Rest}` ? P | Placeholders<Rest> : never;

/** The `{name}` placeholders of a message's Japanese text. */
export type ParamNames<K extends MessageKey> = Placeholders<(typeof ja)[K]>;

export type ParamValue = string | number;

/** The arguments of `t(key, ...)`: none for a message without placeholders, otherwise one object with exactly those. */
export type ParamArgs<K extends MessageKey> = [ParamNames<K>] extends [never] ? [] : [params: { [N in ParamNames<K>]: ParamValue }];

/** The keys whose message has no placeholders: what a constant map of labels (`Record<Tab, PlainKey>`) holds, so `t(MAP[x])` needs no params. */
export type PlainKey = { [K in MessageKey]: [ParamNames<K>] extends [never] ? K : never }[MessageKey];

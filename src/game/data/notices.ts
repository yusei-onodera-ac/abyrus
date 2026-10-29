export interface NoticeEntry {
  id: string;
  /** Short tag shown on the card, e.g. "お知らせ", "イベント", "メンテナンス". */
  category: string;
  title: string;
  /** Full text, opened by tapping the card. Plain text; "\n" breaks a line. */
  body: string;
  /** Shown on the card, e.g. "2026/10/28". */
  date: string;
  /** Filename under public/assets/notices/. Optional - a text-only notice is fine. */
  image?: string;
}

/**
 * The お知らせ board, newest first. This is the thing to edit for an
 * announcement: drop the image (if any) into public/assets/notices/, then add
 * an entry at the top. No code elsewhere needs to change. A notice shows a
 * red NEW tag until the player has opened it.
 */
export const NOTICES: NoticeEntry[] = [
  {
    id: 'new-gacha',
    category: 'イベント',
    title: '新ガチャ開催のお知らせ',
    date: '2026/10/28',
    image: 'new_gacha.jpg',
    body:
      '新ガチャを開催中です。\nガチャ画面から、開催中のガチャと排出率をご確認いただけます。\n\n' +
      '※期間は各ガチャの見出しに表示されています。',
  },
  {
    id: 'welcome',
    category: 'お知らせ',
    title: 'ABYRUSへようこそ',
    date: '2026/10/28',
    body:
      'ABYRUSをご利用いただきありがとうございます。\n\n' +
      'クエストで経験値とゴールドを集め、ガチャで仲間を増やして、あなただけの編成を作りましょう。\n\n' +
      'お知らせ・プレゼント・メールは、ホーム画面右上のボタンからいつでも確認できます。',
  },
];

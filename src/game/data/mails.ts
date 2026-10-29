export interface MailCampaign {
  id: string;
  title: string;
  /** Plain text; "\n" breaks a line. */
  body: string;
  /** Local send time, e.g. "2026-10-28T12:00:00". Delivered to a save once
   *  this time has passed, so a mail can be scheduled ahead. */
  sentAt: string;
}

/**
 * Mails from the operator. Each is delivered to a save once, the next time
 * the player reaches the home screen after its sentAt time. This is the thing
 * to edit to send a mail; no code elsewhere needs to change.
 */
export const MAIL_CAMPAIGNS: MailCampaign[] = [
  {
    id: 'welcome-mail',
    title: 'ABYRUSからのご挨拶',
    sentAt: '2026-10-28T00:00:00',
    body: 'はじめまして。ABYRUS運営です。\nご登録ありがとうございます。\n\nプレゼントBOXに記念の贈り物をご用意しました。ぜひ受け取ってください。',
  },
  {
    id: 'tips-mail',
    title: 'はじめての方へ',
    sentAt: '2026-10-28T00:00:01',
    body: '編成画面では、デッキを最大5つまで作成できます。\n「お任せ編成」を使うと、所持キャラから強い順に自動で並べます。\n\n使用中のデッキが、クエストと無限モードで出撃します。',
  },
];

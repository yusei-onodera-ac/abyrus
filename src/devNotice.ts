/**
 * 開発版のお知らせ: on the dev environment (built with VITE_DEV_ENV=1, see deploy/dev/deploy.sh) the
 * first thing on screen says what this is - a development build, not the public service, with test
 * purchases only - and a small DEV mark stays in the corner after that. A plain page overlay (not a
 * Phaser scene), so it is there before the game has loaded anything and nothing below can be pressed.
 */
const LINES = [
  'これは、開発・動作確認のための環境（DEV）です。一般公開されたサービスではありません。',
  '課金（購入）は、すべてテスト用です。実際に請求されることは、ありません。',
  '開発中のため、内容や数値は、予告なく変わることがあります。',
  '著作権法をはじめ、関係する法令を遵守して制作しています。',
  'URLとパスワードは、関係者以外には教えないでください。',
];

const FONT = '"Hiragino Kaku Gothic ProN", "Noto Sans JP", Meiryo, sans-serif';

export function showDevNotice(): void {
  const badge = document.createElement('div');
  badge.textContent = 'DEV';
  badge.style.cssText = `position:fixed;left:0;top:0;z-index:9000;padding:1px 7px;background:#e0822a;color:#fff;font:bold 10px/14px ${FONT};border-radius:0 0 6px 0;opacity:.7;pointer-events:none`;
  document.body.appendChild(badge);

  const overlay = document.createElement('div');
  overlay.style.cssText = `position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(5,4,3,.94);font-family:${FONT}`;

  const panel = document.createElement('div');
  panel.style.cssText = 'box-sizing:border-box;width:min(560px,100%);max-height:100%;overflow:auto;padding:26px 24px 22px;background:#2e1f12;color:#fff4dc;border:3px solid #c9a052;border-radius:18px;box-shadow:0 0 0 2px #1c130a,0 0 40px rgba(201,160,82,.35)';

  const title = document.createElement('div');
  title.textContent = '開発版（DEV）';
  title.style.cssText = 'text-align:center;font-weight:bold;font-size:28px;letter-spacing:.06em;color:#ffe9b8;margin-bottom:6px';
  const tag = document.createElement('div');
  tag.textContent = 'ABYRUS';
  tag.style.cssText = 'text-align:center;font-size:13px;letter-spacing:.3em;color:#c9a052;margin-bottom:18px';
  panel.append(title, tag);

  const list = document.createElement('ul');
  list.style.cssText = 'margin:0 0 22px;padding:0;list-style:none';
  for (const text of LINES) {
    const li = document.createElement('li');
    li.textContent = text;
    li.style.cssText = 'position:relative;padding:9px 0 9px 22px;font-size:16px;line-height:1.6;border-top:1px solid #5a4426';
    const dot = document.createElement('span');
    dot.style.cssText = 'position:absolute;left:4px;top:18px;width:8px;height:8px;border-radius:50%;background:#c9a052';
    li.prepend(dot);
    list.appendChild(li);
  }
  panel.appendChild(list);

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = '確認して始める';
  button.style.cssText = `display:block;width:100%;padding:14px 0;border:2px solid #ffdca0;border-radius:12px;background:#e0822a;color:#fff;font:bold 22px ${FONT};text-shadow:0 2px 0 #4a2406;cursor:pointer`;
  const close = (): void => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Enter') close();
  };
  button.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  panel.appendChild(button);

  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  button.focus();
}

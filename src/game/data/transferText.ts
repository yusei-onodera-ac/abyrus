/**
 * データ引き継ぎ: every line the player is shown by the feature, in one place (to be moved to translation keys later).
 * Used by systems/TransferSystem.ts (the messages that come back with a result), ui/TransferDialogs.ts, the 名前 step of
 * the チュートリアル (data/tutorial.ts, ui/TutorialOverlay.ts) and the 設定 screen. Functions are for the lines that carry a value.
 */
export const TRANSFER_TEXT = {
  // ---- 設定 > データ引き継ぎ
  settings: {
    section: 'データ引き継ぎ',
    issueLabel: '引き継ぎコードの発行',
    issueNote: 'いまのデータを暗号化して、サーバーに預けます。新しい端末でコードとパスワードを入れると、続きから遊べます。',
    issueButton: '発行',
    reissueButton: '再発行',
    issuedLabel: '発行ずみのコード',
    issued: (when: string): string => `発行ずみ ${when}`,
    issuedNote: 'このコードで引き継げるのは、発行したときのデータです。進めたあとは、もう一度発行してください。',
    showCodeButton: 'コード',
    restoreLabel: 'データを引き継ぐ',
    restoreNote: 'ほかの端末で発行した、引き継ぎコードとパスワードで、その続きから遊べます。いまのデータは消えます。',
    restoreButton: '引き継ぐ',
    unavailable: '通信の設定がないため、データ引き継ぎは使えません。',
  },

  // ---- チュートリアルの 名前 step
  nameStep: {
    lines: ['ねえ、軍団長。まずは、あなたの名前を教えてよ！', '前に遊んだデータがあるなら、「データを引き継ぐ」を押してね。'],
    label: 'プレイヤー名',
    placeholder: '名前を入力',
    hint: (max: number): string => `${max}文字までです。あとから設定で変えられます。`,
    submit: '決定',
    restore: 'データを引き継ぐ',
    restoreCaption: '前に遊んだデータが、ほかの端末にあるかたはこちら',
    empty: '名前を入力してください',
    stripped: '絵文字などの使えない文字は、取りのぞきました',
  },

  // ---- 発行
  issue: {
    title: '引き継ぎコードの発行',
    intro: 'パスワードを決めてください。新しい端末で引き継ぐときに、コードといっしょに使います。',
    passwordLabel: 'パスワード',
    passwordPlaceholder: '8文字以上',
    confirmLabel: 'パスワード（もう一度）',
    confirmPlaceholder: 'もう一度入力',
    show: '表示',
    hide: '隠す',
    warn: 'パスワードは、この端末にも保存されません。忘れると引き継げません。',
    allianceWarn: '同盟に入っています。引き継ぎのあとは、新しい端末で同盟に入り直しになります。同盟長のかたは、先に同盟長をゆずってください。',
    cancel: 'キャンセル',
    submit: '発行する',
    working: '暗号化して、預けています…',
    resultTitle: '引き継ぎコードを発行しました',
    codeLabel: '引き継ぎコード',
    copy: 'コピー',
    copied: 'コードをコピーしました',
    copyFailed: 'コピーできませんでした',
    issuedAt: (when: string): string => `発行日時  ${when}`,
    secret: 'コードとパスワードは、他の人に教えないでください。',
    onlyThisData: 'このコードで引き継げるのは、いま発行したデータです。進めたあとに引き継ぐときは、もう一度発行してください。',
    replaced: '前に発行したコードは、使えなくなりました。',
    notReplaced: '前に発行したコードを消せませんでした。そのコードも、まだ使えます。',
    ok: '確認',
  },

  // ---- 引き継ぎ
  restore: {
    title: 'データを引き継ぐ',
    intro: '前の端末で発行した、引き継ぎコードとパスワードを入れてください。',
    codeLabel: '引き継ぎコード',
    codePlaceholder: 'XXXXX-XXXXX-XXXXX-XXXXX',
    passwordLabel: 'パスワード',
    passwordPlaceholder: 'パスワード',
    cancel: 'キャンセル',
    submit: '引き継ぐ',
    working: 'データを受け取っています…',
    applying: 'データを入れています…',
    confirmTitle: '引き継ぎの確認',
    confirmBody: (name: string, level: number, stage: number, savedAt: string): string =>
      `プレイヤー名  ${name}\nプレイヤーLv  ${level}\nクエスト  ${stage}ステージ クリア\n発行日時  ${savedAt}\n\nいまのデータは消えて、このデータに置きかわります。\n元に戻せません。`,
    confirmButton: '引き継ぐ',
    doneTitle: '引き継ぎが完了しました',
    doneBody: (name: string, level: number): string => `${name}（Lv ${level}）のデータを受け取りました。`,
    doneNote: 'フレンドIDは、この端末のものを使います。',
    doneAlliance: '同盟には、入り直してください。',
    doneRetry: 'データを受け取りましたが、この端末に保存できませんでした。空き容量を確認して、もう一度ためしてください。',
    ok: '確認',
  },

  // ---- うまくいかなかったとき (TransferSystem が、理由といっしょに返す)
  errors: {
    notConfigured: '通信の設定がないため、データ引き継ぎは使えません。',
    codeEmpty: '引き継ぎコードを入力してください',
    codeBad: '引き継ぎコードの形が正しくありません。20文字（英数字）のコードです。',
    passwordEmpty: 'パスワードを入力してください',
    passwordShort: (min: number): string => `パスワードは、${min}文字以上にしてください`,
    passwordLong: (max: number): string => `パスワードは、${max}文字までにしてください`,
    passwordWeak: 'そのパスワードは、かんたんすぎます。別のものにしてください',
    passwordMismatch: 'パスワードが、一致しません',
    notFound: 'その引き継ぎコードは、見つかりませんでした。コードを確かめてください。',
    wrongPasswordLeft: (left: number): string => `パスワードが、ちがいます（あと${left}回まちがえると、しばらく使えなくなります）`,
    locked: (minutes: number): string => `まちがいが続いたため、あと${minutes}分ほど、ためせません`,
    offline: '通信できませんでした。電波の良いところで、もう一度ためしてください。',
    denied: 'いまは、データ引き継ぎを使えません。しばらくしてから、もう一度ためしてください。',
    broken: 'データが壊れているか、正しい形ではありません。引き継げませんでした。',
    newer: 'このデータは、新しいバージョンのゲームで作られました。アプリを更新してから、もう一度ためしてください。',
    unsupported: 'この端末では、引き継ぎに必要な機能が使えません。',
    tooLarge: (maxKb: number): string => `データが大きすぎて、引き継ぎコードを作れません（上限は 約${maxKb}KB）`,
    unknown: 'うまくいきませんでした。もう一度ためしてください。',
  },
} as const;

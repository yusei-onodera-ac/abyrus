import { t, trList } from '../i18n';

/**
 * データ引き継ぎ: every line the player is shown by the feature, in one place. The texts are translation keys now
 * (`transfer.*`, i18n/ja/transfer.ts and i18n/en/transfer.ts): each field is read where it is drawn (a getter or a function), so it
 * follows the language. Used by systems/TransferSystem.ts (the messages that come back with a result), ui/TransferDialogs.ts, the
 * 名前 step of the チュートリアル (data/tutorial.ts, ui/TutorialOverlay.ts) and the 設定 screen.
 */

/** The Japanese lines of the チュートリアル's 名前 step (the English is in i18n/data/tutorialEn.ts, read with trList). */
export const NAME_STEP_LINES_JA: readonly string[] = ['ねえ、軍団長。まずは、あなたの名前を教えてよ！', '前に遊んだデータがあるなら、「データを引き継ぐ」を押してね。'];

export const TRANSFER_TEXT = {
  // ---- 設定 > データ引き継ぎ
  settings: {
    get section(): string {
      return t('transfer.settings.section');
    },
    get issueLabel(): string {
      return t('transfer.settings.issueLabel');
    },
    get issueNote(): string {
      return t('transfer.settings.issueNote');
    },
    get issueButton(): string {
      return t('transfer.settings.issueButton');
    },
    get reissueButton(): string {
      return t('transfer.settings.reissueButton');
    },
    get issuedLabel(): string {
      return t('transfer.settings.issuedLabel');
    },
    issued: (when: string): string => t('transfer.settings.issued', { when }),
    get issuedNote(): string {
      return t('transfer.settings.issuedNote');
    },
    get showCodeButton(): string {
      return t('transfer.settings.showCodeButton');
    },
    get restoreLabel(): string {
      return t('transfer.settings.restoreLabel');
    },
    get restoreNote(): string {
      return t('transfer.settings.restoreNote');
    },
    get restoreButton(): string {
      return t('transfer.settings.restoreButton');
    },
    get unavailable(): string {
      return t('transfer.settings.unavailable');
    },
  },

  // ---- チュートリアルの 名前 step
  nameStep: {
    get lines(): readonly string[] {
      return trList('tutorial', 'name_entry', 'lines', NAME_STEP_LINES_JA);
    },
    get label(): string {
      return t('transfer.nameStep.label');
    },
    get placeholder(): string {
      return t('transfer.nameStep.placeholder');
    },
    hint: (max: number): string => t('transfer.nameStep.hint', { max }),
    get submit(): string {
      return t('transfer.nameStep.submit');
    },
    get restore(): string {
      return t('transfer.nameStep.restore');
    },
    get restoreCaption(): string {
      return t('transfer.nameStep.restoreCaption');
    },
    get empty(): string {
      return t('transfer.nameStep.empty');
    },
    get stripped(): string {
      return t('transfer.nameStep.stripped');
    },
  },

  // ---- 発行
  issue: {
    get title(): string {
      return t('transfer.issue.title');
    },
    get intro(): string {
      return t('transfer.issue.intro');
    },
    get passwordLabel(): string {
      return t('transfer.issue.passwordLabel');
    },
    get passwordPlaceholder(): string {
      return t('transfer.issue.passwordPlaceholder');
    },
    get confirmLabel(): string {
      return t('transfer.issue.confirmLabel');
    },
    get confirmPlaceholder(): string {
      return t('transfer.issue.confirmPlaceholder');
    },
    get show(): string {
      return t('transfer.issue.show');
    },
    get hide(): string {
      return t('transfer.issue.hide');
    },
    get warn(): string {
      return t('transfer.issue.warn');
    },
    get allianceWarn(): string {
      return t('transfer.issue.allianceWarn');
    },
    get cancel(): string {
      return t('transfer.issue.cancel');
    },
    get submit(): string {
      return t('transfer.issue.submit');
    },
    get working(): string {
      return t('transfer.issue.working');
    },
    get resultTitle(): string {
      return t('transfer.issue.resultTitle');
    },
    get codeLabel(): string {
      return t('transfer.issue.codeLabel');
    },
    get copy(): string {
      return t('transfer.issue.copy');
    },
    get copied(): string {
      return t('transfer.issue.copied');
    },
    get copyFailed(): string {
      return t('transfer.issue.copyFailed');
    },
    issuedAt: (when: string): string => t('transfer.issue.issuedAt', { when }),
    get secret(): string {
      return t('transfer.issue.secret');
    },
    get onlyThisData(): string {
      return t('transfer.issue.onlyThisData');
    },
    get replaced(): string {
      return t('transfer.issue.replaced');
    },
    get notReplaced(): string {
      return t('transfer.issue.notReplaced');
    },
    get ok(): string {
      return t('transfer.issue.ok');
    },
  },

  // ---- 引き継ぎ
  restore: {
    get title(): string {
      return t('transfer.restore.title');
    },
    get intro(): string {
      return t('transfer.restore.intro');
    },
    get codeLabel(): string {
      return t('transfer.restore.codeLabel');
    },
    get codePlaceholder(): string {
      return t('transfer.restore.codePlaceholder');
    },
    get passwordLabel(): string {
      return t('transfer.restore.passwordLabel');
    },
    get passwordPlaceholder(): string {
      return t('transfer.restore.passwordPlaceholder');
    },
    get cancel(): string {
      return t('transfer.restore.cancel');
    },
    get submit(): string {
      return t('transfer.restore.submit');
    },
    get working(): string {
      return t('transfer.restore.working');
    },
    get applying(): string {
      return t('transfer.restore.applying');
    },
    get confirmTitle(): string {
      return t('transfer.restore.confirmTitle');
    },
    confirmBody: (name: string, level: number, stage: number, savedAt: string): string => t('transfer.restore.confirmBody', { name, level, stage, savedAt }),
    get confirmButton(): string {
      return t('transfer.restore.confirmButton');
    },
    get doneTitle(): string {
      return t('transfer.restore.doneTitle');
    },
    doneBody: (name: string, level: number): string => t('transfer.restore.doneBody', { name, level }),
    get doneNote(): string {
      return t('transfer.restore.doneNote');
    },
    get doneAlliance(): string {
      return t('transfer.restore.doneAlliance');
    },
    get doneRetry(): string {
      return t('transfer.restore.doneRetry');
    },
    get ok(): string {
      return t('transfer.restore.ok');
    },
  },

  // ---- うまくいかなかったとき (TransferSystem が、理由といっしょに返す)
  errors: {
    get notConfigured(): string {
      return t('transfer.errors.notConfigured');
    },
    get codeEmpty(): string {
      return t('transfer.errors.codeEmpty');
    },
    get codeBad(): string {
      return t('transfer.errors.codeBad');
    },
    get passwordEmpty(): string {
      return t('transfer.errors.passwordEmpty');
    },
    passwordShort: (min: number): string => t('transfer.errors.passwordShort', { min }),
    passwordLong: (max: number): string => t('transfer.errors.passwordLong', { max }),
    get passwordWeak(): string {
      return t('transfer.errors.passwordWeak');
    },
    get passwordMismatch(): string {
      return t('transfer.errors.passwordMismatch');
    },
    get notFound(): string {
      return t('transfer.errors.notFound');
    },
    wrongPasswordLeft: (left: number): string => t('transfer.errors.wrongPasswordLeft', { left }),
    locked: (minutes: number): string => t('transfer.errors.locked', { minutes }),
    get offline(): string {
      return t('transfer.errors.offline');
    },
    get denied(): string {
      return t('transfer.errors.denied');
    },
    get broken(): string {
      return t('transfer.errors.broken');
    },
    get newer(): string {
      return t('transfer.errors.newer');
    },
    get unsupported(): string {
      return t('transfer.errors.unsupported');
    },
    tooLarge: (maxKb: number): string => t('transfer.errors.tooLarge', { maxKb }),
    get unknown(): string {
      return t('transfer.errors.unknown');
    },
  },
};

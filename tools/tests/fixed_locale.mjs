// Preloaded (node --import) before every logic test: the device language is Japanese, whatever machine runs the tests.
// Why: the game starts in the device's language (src/game/i18n), and many tests assert the Japanese texts. A test of the
// language choice itself passes its own tags to detectLanguage and sets the language it needs.
Object.defineProperty(globalThis, 'navigator', { value: { language: 'ja', languages: ['ja'] }, configurable: true });

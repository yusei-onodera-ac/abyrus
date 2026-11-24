// Shared scanner for the i18n tools: finds the string literals / template strings that contain Japanese in src/
// (read through the TypeScript AST, so comments are never counted).
import ts from 'typescript';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

// kana, kanji, fullwidth forms and CJK punctuation (a lone "：" separator counts too: it differs between languages)
export const JA = /[　-ヿ㐀-䶿一-鿿＀-￯]/;

export function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

export const posix = (p) => p.split(path.sep).join('/');

/** [{ line, text, ignored }] for every Japanese-bearing literal in a file. A template with ${} counts once.
 *  `ignored`: the line (or the one above) says `i18n-ignore` - Japanese that is meant to stay (an id, a parser's keyword ...). */
export function scanFile(file) {
  const text = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  // `i18n-ignore-file` anywhere in a file: none of its Japanese is player-facing text (a developer tool page, a dev-only notice)
  if (/i18n-ignore-file/.test(text)) return [];
  const lines = text.split(/\r?\n/);
  const hits = [];
  const add = (node, value) => {
    if (!JA.test(value)) return;
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    const ignored = /i18n-ignore/.test(lines[line] ?? '') || /i18n-ignore/.test(lines[line - 1] ?? '');
    hits.push({ line: line + 1, text: value.replace(/\s+/g, ' ').trim(), ignored });
  };
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      add(node, node.text);
    } else if (ts.isTemplateExpression(node)) {
      add(node, node.head.text + node.templateSpans.map((s) => '${}' + s.literal.text).join(''));
      for (const span of node.templateSpans) visit(span.expression); // literals nested inside ${...}
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

/** [{ line, text }] for every `t(...)` / `tl(...)` / `tr(...)` / `trList(...)` call that runs when the module loads or when a class is
 *  built (not inside any function): it would keep the language of that moment for good (docs/I18N.md, "してはいけないこと"). */
export function scanStaleCalls(file) {
  const text = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const found = [];
  const NAMES = new Set(['t', 'tl', 'tr', 'trList']);
  const visit = (node, inFunction) => {
    const fn = inFunction || ts.isFunctionLike(node) || ts.isClassStaticBlockDeclaration(node);
    if (!inFunction && ts.isCallExpression(node) && ts.isIdentifier(node.expression) && NAMES.has(node.expression.text) && !fn) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      found.push({ line: line + 1, text: node.getText(sf).slice(0, 80) });
    }
    ts.forEachChild(node, (c) => visit(c, fn));
  };
  visit(sf, false);
  return found;
}

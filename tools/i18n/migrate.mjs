// Moves the Japanese text of screens into the translation tables: a semi-automatic helper for the migration (docs/I18N.md).
//
//   node tools/i18n/migrate.mjs extract <ns> <out-dir> <file>...     list what would move (nothing is changed)
//        -> <out-dir>/work.json   the entries (ids A001...) with the source position of each
//        -> <out-dir>/translate.tsv   id <TAB> Japanese text with {placeholders} <TAB> where it is used
//        -> printed: DEFERRED (not inside a function: it would be evaluated once, at load) and MANUAL (needs a person) lists
//   node tools/i18n/migrate.mjs apply <ns> <out-dir> <en.tsv> [--dry]
//        en.tsv: id <TAB> English text [<TAB> explicit key]. Rewrites each literal into t('ns.file.key'), adds the
//        Japanese text to src/game/i18n/ja/<ns>.ts and the English to en/<ns>.ts, and adds the import.
//
// Keys are made from the English text (`quest.stageSelect.startBattle`): a short readable name that is then fixed for good.
// An exact Japanese text that already exists in common.* reuses that key.
import ts from 'typescript';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JA, posix } from './scan.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const [, , cmd, ns, outDir, ...rest] = process.argv;

const SKIP_CALLEES = new Set(['includes', 'indexOf', 'startsWith', 'endsWith', 'split', 'replace', 'replaceAll', 'match', 'test', 'has', 'get', 'localeCompare', 'RegExp']);
const ID_PROPS = new Set(['id', 'key', 'kind', 'type', 'scene']);

const jsq = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, '\\n')}'`;

function calleeName(call) {
  const e = call.expression;
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  return '';
}

const FORMATTERS = new Set(['toLocaleString', 'toFixed', 'padStart', 'padEnd', 'toString', 'floor', 'round', 'ceil', 'min', 'max', 'abs', 'trunc', 'String', 'Number', 'format']);

/** A readable placeholder name for an expression: `count`, `name`, `level` ... (`value` when nothing better). */
function exprName(e) {
  let name = 'value';
  if (ts.isIdentifier(e)) name = e.text;
  else if (ts.isPropertyAccessExpression(e)) name = e.name.text === 'length' ? 'count' : e.name.text;
  else if (ts.isElementAccessExpression(e)) name = ts.isIdentifier(e.expression) ? e.expression.text : ts.isPropertyAccessExpression(e.expression) ? e.expression.name.text : 'value';
  else if (ts.isNonNullExpression(e) || ts.isParenthesizedExpression(e) || ts.isAsExpression(e)) return exprName(e.expression);
  else if (ts.isBinaryExpression(e)) return exprName(e.left) === 'value' ? exprName(e.right) : exprName(e.left);
  else if (ts.isCallExpression(e)) {
    const callee = calleeName(e);
    const dateName = new Map([['getFullYear', 'year'], ['getMonth', 'month'], ['getDate', 'day'], ['getHours', 'hours'], ['getMinutes', 'minutes'], ['getSeconds', 'seconds']]).get(callee);
    if (dateName) return dateName;
    if (FORMATTERS.has(callee)) {
      if (ts.isPropertyAccessExpression(e.expression) && !/^(Math|Number|String|Intl)$/.test(e.expression.expression.getText())) return exprName(e.expression.expression);
      if (e.arguments.length) return exprName(e.arguments[0]);
    } else name = callee || 'value';
  }
  if (!/^[A-Za-z_]\w*$/.test(name) || /^(toString|valueOf)$/.test(name)) name = 'value';
  return name;
}

/** All Japanese-bearing literals of a file as entries, in source order. */
function extractFile(file) {
  const text = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const lines = text.split(/\r?\n/);
  const entries = [];
  const lineOf = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line;

  const classify = (node) => {
    const ln = lineOf(node);
    if (/i18n-ignore/.test(lines[ln] ?? '') || /i18n-ignore/.test(lines[ln - 1] ?? '')) return 'ignore';
    const p = node.parent;
    if (ts.isPropertyAssignment(p) && p.name === node) return 'skip:property name';
    if (ts.isLiteralTypeNode(p) || ts.isTypeNode(p)) return 'skip:type';
    if (ts.isEnumMember(p) || ts.isPropertySignature(p)) return 'skip:declaration';
    if (ts.isBinaryExpression(p) && ['===', '!==', '==', '!='].includes(p.operatorToken.getText(sf))) return 'skip:comparison';
    if (ts.isCaseClause(p)) return 'skip:case';
    if (ts.isElementAccessExpression(p) && p.argumentExpression === node) return 'skip:index';
    if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && ID_PROPS.has(p.name.text) && !/[ \u3000]/.test(node.text ?? '')) return 'skip:id-like property';
    // an argument of a keyword-style call (includes/test/...), console, or an Error: not for the player
    let a = p;
    while (a && (ts.isParenthesizedExpression(a) || ts.isTemplateSpan(a) || ts.isTemplateExpression(a))) a = a.parent;
    if (a && (ts.isCallExpression(a) || ts.isNewExpression(a))) {
      const name = ts.isCallExpression(a) ? calleeName(a) : a.expression.getText(sf);
      if (SKIP_CALLEES.has(name)) return 'skip:keyword call';
      if (ts.isCallExpression(a) && ts.isPropertyAccessExpression(a.expression) && a.expression.expression.getText(sf) === 'console') return 'skip:console';
      if (ts.isNewExpression(a) && /Error$/.test(name)) return 'skip:error';
    }
    let inFunction = false;
    for (let n = node.parent; n; n = n.parent) if (ts.isFunctionLike(n) || ts.isClassStaticBlockDeclaration(n)) inFunction = true;
    if (!inFunction) return 'deferred';
    if (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.PlusToken) return 'manual:concatenation';
    return 'ok';
  };

  const context = (node) => {
    let p = node.parent;
    while (p && (ts.isParenthesizedExpression(p) || ts.isConditionalExpression(p) || ts.isTemplateSpan(p) || ts.isTemplateExpression(p))) p = p.parent;
    if (p && ts.isPropertyAssignment(p) && ts.isIdentifier(p.name)) return p.name.text;
    if (p && ts.isCallExpression(p)) return `${calleeName(p)}()`;
    if (p && ts.isNewExpression(p)) return `new ${p.expression.getText(sf)}()`;
    if (p && ts.isArrayLiteralExpression(p)) return 'array item';
    if (p && ts.isVariableDeclaration(p)) return `const ${p.name.getText(sf)}`;
    if (p && ts.isReturnStatement(p)) return 'return';
    if (p && ts.isBinaryExpression(p)) return 'binary';
    return ts.SyntaxKind[p?.kind ?? 0] ?? '';
  };

  const hasJa = (n) => {
    let found = false;
    const walk = (x) => {
      if ((ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x)) && JA.test(x.text)) found = true;
      else if (ts.isTemplateExpression(x) && JA.test(x.head.text + x.templateSpans.map((s) => s.literal.text).join(''))) found = true;
      if (!found) ts.forEachChild(x, walk);
    };
    walk(n);
    return found;
  };

  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (JA.test(node.text)) entries.push({ node, text: node.text, params: [], status: classify(node), ctx: context(node) });
      return;
    }
    if (ts.isTemplateExpression(node)) {
      const lit = node.head.text + node.templateSpans.map((s) => s.literal.text).join('');
      if (JA.test(lit)) {
        let status = classify(node);
        const nestedJa = node.templateSpans.some((s) => hasJa(s.expression));
        if (nestedJa && status === 'ok') status = 'manual:template with Japanese inside ${}';

        const params = [];
        let text = node.head.text;
        for (const span of node.templateSpans) {
          const src = span.expression.getText(sf);
          let found = params.find((q) => q.src === src);
          if (!found) {
            let name = exprName(span.expression);
            let k = 2;
            const base = name;
            while (params.some((q) => q.name === name)) name = `${base}${k++}`;
            found = { name, src };
            params.push(found);
          }
          text += `{${found.name}}${span.literal.text}`;
        }
        entries.push({ node, text, params, status, ctx: context(node) });
        if (nestedJa) for (const span of node.templateSpans) visit(span.expression);
        return;
      }
      for (const span of node.templateSpans) visit(span.expression);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { sf, text, entries };
}

function toRel(file) {
  return posix(path.relative(root, path.resolve(root, file)));
}

if (cmd === 'extract') {
  mkdirSync(outDir, { recursive: true });
  const work = [];
  const tsv = [];
  const deferred = [];
  const manual = [];
  const skipped = {};
  let n = 0;
  for (const f of rest) {
    const rel = toRel(f);
    const { entries } = extractFile(path.resolve(root, rel));
    for (const e of entries) {
      const line = e.node.getSourceFile().getLineAndCharacterOfPosition(e.node.getStart()).line + 1;
      if (e.status === 'ok') {
        const id = `A${String(++n).padStart(4, '0')}`;
        work.push({ id, file: rel, line, ja: e.text, params: e.params, ctx: e.ctx });
        const extra = e.params.filter((p) => !/^[A-Za-z_]\w*$/.test(p.src)).map((p) => `${p.name}=${p.src}`).join('; ');
        tsv.push(`${id}\t${e.text.replace(/\r?\n/g, '\\n')}\t${path.basename(rel)}:${line} ${e.ctx}${extra ? ` [${extra}]` : ''}`);
      } else if (e.status === 'deferred') deferred.push(`${rel}:${line}  ${e.text.slice(0, 50)}`);
      else if (e.status.startsWith('manual')) manual.push(`${rel}:${line}  (${e.status.slice(7)})  ${e.text.slice(0, 50)}`);
      else skipped[e.status] = (skipped[e.status] ?? 0) + 1;
    }
  }
  writeFileSync(path.join(outDir, 'work.json'), JSON.stringify({ ns, work }, null, 1));
  writeFileSync(path.join(outDir, 'translate.tsv'), tsv.join('\n') + '\n');
  console.log(`${work.length} entries to translate -> ${path.join(outDir, 'translate.tsv')}`);
  console.log(`skipped (not UI text): ${JSON.stringify(skipped)}`);
  console.log(`DEFERRED (outside any function: convert by hand to run when drawn): ${deferred.length}`);
  for (const d of deferred) console.log(`  ${d}`);
  console.log(`MANUAL (concatenations / templates with Japanese inside): ${manual.length}`);
  for (const d of manual) console.log(`  ${d}`);
} else if (cmd === 'apply') {
  const enFile = rest[0];
  const dry = rest.includes('--dry');
  const { work } = JSON.parse(readFileSync(path.join(outDir, 'work.json'), 'utf8'));
  const translations = new Map();
  for (const line of readFileSync(enFile, 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('#')) continue;
    const [id, en, key] = line.split('\t');
    translations.set(id, { en: (en ?? '').replace(/\\n/g, '\n'), key: key?.trim() });
  }
  const problems = [];

  // ---- the existing tables of this namespace (and common, for reuse)
  const partPath = (lang, name) => path.join(root, 'src/game/i18n', lang, `${name}.ts`);
  const readPart = (lang, name) => {
    const p = partPath(lang, name);
    const entries = new Map();
    if (!existsSync(p)) return entries;
    const body = readFileSync(p, 'utf8');
    for (const m of body.matchAll(/^\s*'([^'\n]+)'\s*:\s*'((?:[^'\\\n]|\\.)*)'\s*,/gm)) entries.set(m[1], m[2].replace(/\\n/g, '\n').replace(/\\'/g, "'").replace(/\\\\/g, '\\'));
    return entries;
  };
  const jaPart = readPart('ja', ns);
  const common = readPart('ja', 'common');
  const commonByJa = new Map([...common].map(([k, v]) => [v, k]));

  const slug = (en) => {
    const stripped = en.replace(/\{[^{}]*(\{[^{}]*\}[^{}]*)*\}/g, ' ');
    const words = stripped.match(/[A-Za-z0-9]+/g) ?? [];
    const w = words.slice(0, 4).map((x, i) => (i === 0 ? x.toLowerCase() : x[0].toUpperCase() + x.slice(1).toLowerCase()));
    let s = w.join('').slice(0, 30) || 'text';
    if (/^\d/.test(s)) s = `n${s}`;
    return s;
  };
  const prefixOf = (rel) => {
    const base = path.basename(rel, '.ts').replace(/(Scene|System)$/, '');
    return base.charAt(0).toLowerCase() + base.slice(1);
  };

  const newJa = new Map(); // key -> ja
  const newEn = new Map(); // key -> en
  const groups = []; // [{ prefix, keys: [] }] in order, for comments
  const keyFor = new Map(); // `${prefix}|${ja}|${en}` -> key
  const decided = new Map(); // id -> key
  const skipIds = new Set();
  for (const w of work) {
    const tr = translations.get(w.id);
    // "@skip" as the English: this literal is not player-facing text (an id, a developer message ...): it stays as it is
    // (put `// i18n-ignore` on its line so the checker does not list it).
    if (tr && tr.en === '@skip') {
      skipIds.add(w.id);
      continue;
    }
    if (!tr || !tr.en) {
      problems.push(`${w.id} (${w.file}:${w.line}) has no English`);
      continue;
    }
    const names = (s) => new Set([...s.matchAll(/\{\s*([A-Za-z_]\w*)\s*(?=[,}])/g)].map((m) => m[1]));
    const plain = (s) => s.replace(/\{\s*[A-Za-z_]\w*\s*,\s*plural\s*,(?:[^{}]|\{[^{}]*\})*\}/g, (m) => `{${m.match(/\{\s*([A-Za-z_]\w*)/)[1]}}`);
    const a = names(plain(w.ja));
    const b = names(plain(tr.en));
    if (a.size !== b.size || [...a].some((x) => !b.has(x))) problems.push(`${w.id} (${w.file}:${w.line}): placeholders {${[...b]}} differ from the Japanese {${[...a]}}`);
    const prefix = prefixOf(w.file);
    const cacheId = `${prefix}|${w.ja}|${tr.en}`;
    let key = tr.key ? (tr.key.includes('.') ? tr.key : `${ns}.${tr.key}`) : undefined;
    if (!key && a.size === 0 && commonByJa.has(w.ja)) key = commonByJa.get(w.ja);
    if (!key && keyFor.has(cacheId)) key = keyFor.get(cacheId);
    if (!key) {
      const base = prefix === ns ? `${ns}.${slug(tr.en)}` : `${ns}.${prefix}.${slug(tr.en)}`;
      key = base;
      let k = 2;
      while ((jaPart.has(key) && jaPart.get(key) !== w.ja) || (newJa.has(key) && newJa.get(key) !== w.ja) || (newEn.has(key) && newEn.get(key) !== tr.en)) key = `${base}${k++}`;
    }
    keyFor.set(cacheId, key);
    decided.set(w.id, key);
    if (!common.has(key) && !jaPart.has(key) && !newJa.has(key)) {
      newJa.set(key, w.ja);
      newEn.set(key, tr.en);
      let g = groups.find((x) => x.prefix === prefix);
      if (!g) groups.push((g = { prefix, file: path.basename(w.file), keys: [] }));
      g.keys.push(key);
    }
  }
  if (problems.length) {
    console.log(`NOT APPLIED: ${problems.length} problem(s)`);
    for (const p of problems.slice(0, 40)) console.log(`  - ${p}`);
    process.exit(1);
  }

  // ---- rewrite the sources
  const byFile = new Map();
  for (const w of work) {
    if (!byFile.has(w.file)) byFile.set(w.file, []);
    byFile.get(w.file).push(w);
  }
  const rewritten = [];
  for (const [rel, items] of byFile) {
    const abs = path.resolve(root, rel);
    const { sf, text, entries } = extractFile(abs);
    const crlf = text.includes('\r\n');
    const okEntries = entries.filter((e) => e.status === 'ok');
    if (okEntries.length !== items.length || okEntries.some((e, i) => e.text !== items[i].ja)) {
      console.log(`NOT APPLIED: ${rel} changed since extract (${okEntries.length} entries now, ${items.length} before)`);
      process.exit(1);
    }
    // does the file already use a name `t`?
    let hasT = false;
    const seek = (n) => {
      if (ts.isIdentifier(n) && n.text === 't' && (ts.isParameter(n.parent) || ts.isVariableDeclaration(n.parent) || ts.isBindingElement(n.parent) || ts.isPropertyDeclaration(n.parent)) && n.parent.name === n) hasT = true;
      ts.forEachChild(n, seek);
    };
    seek(sf);
    const fn = hasT ? 'tl' : 't';
    const edits = okEntries.flatMap((e, i) => {
      if (skipIds.has(items[i].id)) return [];
      const key = decided.get(items[i].id);
      const call = e.params.length
        ? `${fn}(${jsq(key)}, { ${e.params.map((p) => (p.name === p.src ? p.name : `${p.name}: ${p.src}`)).join(', ')} })`
        : `${fn}(${jsq(key)})`;
      return [{ start: e.node.getStart(sf), end: e.node.getEnd(), call }];
    });
    let out = text;
    for (const ed of edits.sort((x, y) => y.start - x.start)) out = out.slice(0, ed.start) + ed.call + out.slice(ed.end);
    // import
    const rel2 = path.relative(path.dirname(abs), path.join(root, 'src/game/i18n')).split(path.sep).join('/');
    const spec = rel2.startsWith('.') ? rel2 : `./${rel2}`;
    const importLine = hasT ? `import { t as tl } from '${spec}';` : `import { t } from '${spec}';`;
    const existing = /import\s*\{([^}]*)\}\s*from\s*'[^']*\/i18n'\s*;/.exec(out);
    if (existing) {
      const names = existing[1].split(',').map((s) => s.trim()).filter(Boolean);
      const want = hasT ? 't as tl' : 't';
      if (!names.includes(want)) out = out.replace(existing[0], existing[0].replace(existing[1], ` ${[...names, want].join(', ')} `));
    } else {
      const re = /^import[^;]*;\r?\n/gm;
      let last = 0;
      for (const m of out.matchAll(re)) last = m.index + m[0].length;
      const nl = crlf ? '\r\n' : '\n';
      out = out.slice(0, last) + importLine + nl + out.slice(last);
    }
    if (crlf && !out.includes('\r\n')) out = out.replace(/\n/g, '\r\n');
    else if (crlf) out = out.replace(/\r?\n/g, '\r\n');
    if (edits.length === 0) continue;
    rewritten.push(rel);
    if (!dry) writeFileSync(abs, out);
  }

  // ---- the tables
  const addToPart = (lang, values) => {
    const p = partPath(lang, ns);
    let body = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
    let block = '';
    for (const g of groups) {
      block += `  // ${g.file}\n`;
      for (const k of g.keys) block += `  ${jsq(k)}: ${jsq(values.get(k))},\n`;
    }
    if (!block) return;
    if (/=\s*\{\}\s*(as const)?;/.test(body)) body = body.replace(/\{\}(\s*(as const)?;)/, `{\n${block}}$1`);
    else body = body.replace(/\n\}(\s*(as const)?;\s*)$/, `\n${block}}$1`);
    if (!dry) writeFileSync(p, body.replace(/\n/g, '\r\n'));
  };
  addToPart('ja', newJa);
  addToPart('en', newEn);
  console.log(`${dry ? '(dry run) ' : ''}rewrote ${rewritten.length} file(s), ${newJa.size} new keys in ${ns}`);
  for (const r of rewritten) console.log(`  ${r}`);
} else {
  console.log('usage: migrate.mjs extract <ns> <out-dir> <file>... | apply <ns> <out-dir> <en.tsv> [--dry]');
  process.exit(1);
}

#!/usr/bin/env node
/**
 * `any` budget (ratchet). Counts explicit `any` types in tracked source files
 * using the TypeScript AST (comments/strings are ignored) and fails if the count
 * is higher than the budget in .any-budget.json, so `any` can only go down.
 *
 *   node scripts/check-any-budget.cjs            # check (CI)
 *   node scripts/check-any-budget.cjs --update   # write the current count as the new budget
 *
 * After you remove some `any`s, run with --update and commit the lower number.
 * Tests, generated code and type declarations are not counted.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const budgetFile = path.join(root, '.any-budget.json');
const EXCLUDE = [
  /\.d\.ts$/,
  /\.(spec|test)\.tsx?$/,
  /(^|\/)__tests__\//,
  /(^|\/)test\//,
  /(^|\/)migrations\//,
  /api\.generated\.ts$/,
  /^vitest\.setup\.ts$/
];

const files = execSync("git ls-files '*.ts' '*.tsx'", { cwd: root, maxBuffer: 1 << 26 })
  .toString()
  .split('\n')
  .filter(Boolean)
  .filter((f) => !EXCLUDE.some((re) => re.test(f)));

let total = 0;
const byDir = {};
for (const file of files) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  let n = 0;
  (function walk(node) {
    if (node.kind === ts.SyntaxKind.AnyKeyword) n++;
    ts.forEachChild(node, walk);
  })(sf);
  if (n) {
    total += n;
    const dir = file.split('/').slice(0, 2).join('/');
    byDir[dir] = (byDir[dir] || 0) + n;
  }
}

if (process.argv.includes('--update')) {
  fs.writeFileSync(budgetFile, JSON.stringify({ total }, null, 2) + '\n');
  console.log(`any budget set to ${total}`);
  process.exit(0);
}

const budget = JSON.parse(fs.readFileSync(budgetFile, 'utf8')).total;
if (total > budget) {
  const top = Object.entries(byDir).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([d, c]) => `  ${d}: ${c}`).join('\n');
  console.error(`Explicit \`any\` count is ${total}, budget is ${budget} (+${total - budget}).\nUse a real type or \`unknown\`. Top areas:\n${top}`);
  process.exit(1);
}
console.log(`any count ${total} <= budget ${budget}` + (total < budget ? ` — run with --update to lower the budget to ${total}` : ''));

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptFolder = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptFolder, '..', '..', '..', '..', '..', '..');
const rushBin = path.join(repoRoot, 'apps', 'rush', 'bin', 'rush');
const outputFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-reporter-demo-'));
const commonArgs = ['build', '--only', '@rushstack/rush-reporter'];

function run(name, args, env = {}) {
  const result = spawnSync(process.execPath, [rushBin, ...args], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    encoding: 'utf8'
  });
  fs.writeFileSync(path.join(outputFolder, `${name}.stdout`), result.stdout);
  fs.writeFileSync(path.join(outputFolder, `${name}.stderr`), result.stderr);
  if (result.status !== 0) {
    throw new Error(`${name} failed with exit code ${result.status}\n${result.stderr}`);
  }
  return result.stdout;
}

run('warmup', commonArgs);
const legacy = run('legacy', commonArgs);
const rollback = run('rollback', [...commonArgs, '--reporter=json'], { RUSH_REPORTER: 'legacy' });
const normalizeDurations = (text) => text.replace(/\d+\.\d+ seconds/g, '<time> seconds');
if (normalizeDurations(legacy) !== normalizeDurations(rollback)) {
  throw new Error('RUSH_REPORTER=legacy did not reproduce the feature-off output.');
}
const plaintext = run('plaintext', [...commonArgs, '--reporter=plaintext']);
const json = run('json', [...commonArgs, '--reporter=json', '--log-level=debug']);
const ai = run('ai', [...commonArgs, '--reporter=ai']);

for (const line of json.split('\n').filter(Boolean)) {
  JSON.parse(line);
}
for (const line of ai.split('\n').filter(Boolean)) {
  JSON.parse(line);
}

const logMatch = plaintext.match(/^Full log: (.+)$/m);
if (!logMatch || !path.isAbsolute(logMatch[1]) || !fs.existsSync(logMatch[1])) {
  throw new Error('The plaintext reporter did not expose an existing absolute full-log path.');
}

console.log(`Reporter demo outputs: ${outputFolder}`);
console.log(`Full detail log: ${logMatch[1]}`);

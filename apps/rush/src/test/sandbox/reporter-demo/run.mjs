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

function run(name, args, env = {}, expectedStatus = 0) {
  const result = spawnSync(process.execPath, [rushBin, ...args], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    encoding: 'utf8'
  });
  fs.writeFileSync(path.join(outputFolder, `${name}.stdout`), result.stdout);
  fs.writeFileSync(path.join(outputFolder, `${name}.stderr`), result.stderr);
  if (result.status !== expectedStatus) {
    throw new Error(
      `${name} exited with ${result.status}; expected ${expectedStatus}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
  }
  return result;
}

run('warmup', commonArgs);
const legacy = run('legacy', commonArgs).stdout;
const rollback = run('rollback', [...commonArgs, '--reporter=json'], { RUSH_REPORTER: 'legacy' }).stdout;
const normalizeDurations = (text) => text.replace(/\d+\.\d+ seconds/g, '<time> seconds');
if (normalizeDurations(legacy) !== normalizeDurations(rollback)) {
  throw new Error('RUSH_REPORTER=legacy did not reproduce the feature-off output.');
}
const plaintextEventsPath = path.join(outputFolder, 'plaintext-events.jsonl');
const plaintext = run('plaintext', [
  ...commonArgs,
  '--reporter=plaintext',
  `--output=json://${plaintextEventsPath}?logLevel=debug`
]).stdout;
const json = run('json', [...commonArgs, '--reporter=json', '--log-level=debug']).stdout;
const ai = run('ai', [...commonArgs, '--reporter=ai']).stdout;
const file = run('file', [...commonArgs, '--reporter=file']);
const quiet = run('quiet', [...commonArgs, '--reporter=plaintext', '--log-level=quiet']).stdout;
const failureJson = run(
  'failure-json',
  ['build', '--only', '@rushstack/does-not-exist', '--reporter=json'],
  {},
  1
).stdout;
const failureAi = run(
  'failure-ai',
  ['build', '--only', '@rushstack/does-not-exist', '--reporter=ai'],
  {},
  1
).stdout;
const flagOffHelp = run('help-flag-off', ['--help']).stdout;
const help = run('help', ['--help', '--reporter=json'], { RUSH_REPORTER: 'legacy' }).stdout;
const commandJson = run('command-json', ['list', '--json', '--reporter=file']);
const commandJsonConflict = run('command-json-conflict', ['list', '--json', '--reporter=json'], {}, 1);

function parseNdjson(text, name) {
  if (text.includes('\u001b')) {
    throw new Error(`${name} stdout contains terminal control sequences.`);
  }
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

const jsonEvents = parseNdjson(json, 'json');
const aiRecords = parseNdjson(ai, 'ai');
const failureJsonEvents = parseNdjson(failureJson, 'failure-json');
const failureAiRecords = parseNdjson(failureAi, 'failure-ai');
const plaintextEvents = parseNdjson(fs.readFileSync(plaintextEventsPath, 'utf8'), 'plaintext sidecar');

for (const [name, events] of [
  ['json', jsonEvents],
  ['plaintext sidecar', plaintextEvents]
]) {
  const completedArtifact = events.findLast(
    (event) => event.type === 'artifactAvailable' && event.payload?.role === 'log'
  );
  if (completedArtifact?.payload?.complete !== true) {
    throw new Error(`${name} did not publish a complete final log artifact.`);
  }
  const operations = new Map();
  for (const event of events) {
    const operationId = event.scope?.operationId;
    if (!operationId) {
      continue;
    }
    const record = operations.get(operationId) ?? { closed: 0, completed: 0 };
    if (event.type === 'operationStreamClosed') record.closed++;
    if (event.type === 'operationCompleted') record.completed++;
    operations.set(operationId, record);
  }
  for (const [operationId, record] of operations) {
    if (record.closed !== 1 || record.completed !== 1) {
      throw new Error(
        `${name} operation ${operationId} had ${record.closed} close events and ${record.completed} completion events.`
      );
    }
  }
}

const logMatch = plaintext.match(/^Full log: (.+)$/m);
if (!logMatch || !path.isAbsolute(logMatch[1]) || !fs.existsSync(logMatch[1])) {
  throw new Error('The plaintext reporter did not expose an existing absolute full-log path.');
}
if (process.platform !== 'win32' && (fs.statSync(logMatch[1]).mode & 0o777) !== 0o600) {
  throw new Error('The full-detail log is not owner-only.');
}

const operationId = '@rushstack/rush-reporter#_phase:build';
const rawOutput = plaintextEvents
  .filter((event) => event.type === 'externalOutput' && event.scope?.operationId === operationId)
  .map((event) => event.payload.text)
  .join('');
const groupHeader = '==[ @rushstack/rush-reporter (_phase:build) ]==\n';
const groupStart = plaintext.indexOf(groupHeader);
const groupEnd = plaintext.indexOf('@rushstack/rush-reporter: success', groupStart);
if (groupStart < 0 || groupEnd < 0) {
  throw new Error('The plaintext reporter did not reconstruct the expected operation group.');
}
const groupedOutput = plaintext.slice(groupStart + groupHeader.length, groupEnd);
if (groupedOutput !== rawOutput) {
  throw new Error('Plaintext grouping lost, duplicated, or reordered operation chunks.');
}
if ((rawOutput.match(/---- build started ----/g) ?? []).length !== 1) {
  throw new Error('The operation output contains a duplicated or missing build-start marker.');
}
if (plaintext.includes('Rush Multi-Project Build Tool') || plaintext.includes('1 of 1 ]==')) {
  throw new Error('The reporter path has more than one visible terminal writer.');
}

const aiFinal = aiRecords.at(-1);
if (aiFinal?.kind !== 'ai.final' || aiFinal.log?.complete !== true) {
  throw new Error('AI output did not include a complete full-log reference.');
}
const failureAiFinal = failureAiRecords.at(-1);
if (
  failureAiFinal?.result !== 'failed' ||
  !failureAiFinal.diagnostics?.some((diagnostic) => diagnostic.summary?.includes('does not exist'))
) {
  throw new Error('AI failure output did not preserve the actionable parser error.');
}
if (
  !failureJsonEvents.some((event) => event.type === 'commandResult' && event.payload?.exitCode === 1) ||
  !failureJsonEvents.some((event) => event.type === 'sessionCompleted' && event.payload?.exitCode === 1)
) {
  throw new Error('JSON failure output did not flush its final lifecycle records.');
}
if (quiet.includes('build started') || quiet.includes('==[ @rushstack/rush-reporter')) {
  throw new Error('Quiet output leaked detailed operation output.');
}

const fileLogMatch = file.stderr.match(/^Rush full log: (.+)$/m);
if (file.stdout !== '' || !fileLogMatch || !fs.existsSync(fileLogMatch[1])) {
  throw new Error('The file reporter did not keep stdout empty and expose its log path on stderr.');
}
if (!help.includes('usage: rush') || help.includes('"type":"')) {
  throw new Error('Help output did not remain on the legacy parser-only path.');
}
if (help !== flagOffHelp) {
  throw new Error('RUSH_REPORTER=legacy changed the byte-for-byte parser output.');
}
const commandJsonPayload = JSON.parse(commandJson.stdout);
if (!Array.isArray(commandJsonPayload.projects) || commandJson.stdout.includes('"protocolVersion"')) {
  throw new Error('Command-specific JSON was mixed with reporter records.');
}
if (
  !commandJson.stderr.includes('Rush full log:') ||
  commandJsonConflict.stdout !== '' ||
  !commandJsonConflict.stderr.includes('command-specific --json output owns stdout')
) {
  throw new Error('Command-specific JSON ownership arbitration failed.');
}

console.log(`Reporter demo outputs: ${outputFolder}`);
console.log(`Full detail log: ${logMatch[1]}`);

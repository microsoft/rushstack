// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  findRushJsonPath,
  getAgentCommandName,
  readUseRushReporter,
  selectClientOutputMode
} from '../outputSelection';

describe(selectClientOutputMode.name, () => {
  it.each([
    { argv: ['build'], environment: {}, mode: 'legacy' },
    { argv: ['build'], environment: { RUSHD_OUTPUT: 'agent' }, mode: 'agent' },
    { argv: ['build'], environment: { RUSHD_OUTPUT: ' AGENT ' }, mode: 'agent' },
    { argv: ['build'], environment: { COPILOT_CLI: '1' }, mode: 'agent' },
    { argv: ['build'], environment: { COPILOT_CLI: 'false' }, mode: 'legacy' },
    { argv: ['build'], environment: { COPILOT_CLI: '1', RUSHD_OUTPUT: 'legacy' }, mode: 'legacy' },
    { argv: ['build'], environment: { CLAUDECODE: '1' }, mode: 'legacy' },
    { argv: ['build'], environment: { COPILOT_CLI: '1', RUSH_REPORTER: 'legacy' }, mode: 'agent' },
    { argv: ['build'], environment: { COPILOT_CLI: '1', RUSH_REPORTER: ' LEGACY ' }, mode: 'agent' },
    // Explicit reporter controls always keep the native reporter path, and nothing is written ahead of it.
    { argv: ['build', '--reporter=ai'], environment: { RUSHD_OUTPUT: 'agent' }, mode: 'legacy' },
    { argv: ['build', '--reporter', 'ai'], environment: { COPILOT_CLI: '1' }, mode: 'legacy' },
    { argv: ['build', '--reporter=ai', '--no-daemon'], environment: { COPILOT_CLI: '1' }, mode: 'legacy' },
    { argv: ['build', '--no-daemon'], environment: { RUSHD_OUTPUT: 'agent' }, mode: 'legacy' },
    { argv: ['build', '--output', 'x.log'], environment: { RUSHD_OUTPUT: 'agent' }, mode: 'legacy' },
    { argv: ['build'], environment: { RUSHD_OUTPUT: 'agent', RUSH_REPORTER: 'ai' }, mode: 'legacy' },
    { argv: ['build'], environment: { RUSHD_OUTPUT: 'agent', RUSH_LOG_LEVEL: 'debug' }, mode: 'legacy' },
    { argv: ['build', '--', '--reporter=ai'], environment: { RUSHD_OUTPUT: 'agent' }, mode: 'agent' }
  ])('selects $mode for $argv with $environment', ({ argv, environment, mode }) => {
    expect(selectClientOutputMode({ argv, environment })).toBe(mode);
  });

  it('keeps useRushReporter repositories on the native reporter output', () => {
    expect(
      selectClientOutputMode({ argv: ['build'], environment: { COPILOT_CLI: '1' }, useRushReporter: true })
    ).toBe('legacy');
  });
});

describe(getAgentCommandName.name, () => {
  it.each([
    { argv: ['build'], commandName: 'build' },
    { argv: ['--wait-timeout', '1.25', 'build'], commandName: 'build' },
    { argv: ['--wait-timeout=2', 'build', '-t', 'a'], commandName: 'build' },
    { argv: ['--no-wait', 'rebuild'], commandName: 'rebuild' },
    { argv: ['--', 'build'], commandName: undefined },
    { argv: ['-q', 'build'], commandName: undefined },
    { argv: ['daemon', 'status'], commandName: undefined },
    { argv: ['build', '--help'], commandName: undefined },
    { argv: ['build', '-h'], commandName: undefined },
    { argv: ['build', '--', '--help'], commandName: 'build' },
    { argv: [], commandName: undefined }
  ])('returns $commandName for $argv', ({ argv, commandName }) => {
    expect(getAgentCommandName(argv)).toBe(commandName);
  });
});

describe(readUseRushReporter.name, () => {
  let folder: string;
  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-output-selection-'));
    fs.writeFileSync(path.join(folder, 'rush.json'), '{}');
    fs.mkdirSync(path.join(folder, 'common', 'config', 'rush'), { recursive: true });
  });
  afterEach(() => fs.rmSync(folder, { recursive: true, force: true }));

  function write(contents: string): void {
    fs.writeFileSync(path.join(folder, 'common', 'config', 'rush', 'experiments.json'), contents);
  }

  it('reads the opt-in and ignores commented-out settings', () => {
    const rushJsonPath: string = path.join(folder, 'rush.json');
    expect(readUseRushReporter(rushJsonPath)).toBe(false);
    write('{\n  // "useRushReporter": true,\n  /* "useRushReporter": true */\n}\n');
    expect(readUseRushReporter(rushJsonPath)).toBe(false);
    write('{ "useRushReporter": false }');
    expect(readUseRushReporter(rushJsonPath)).toBe(false);
    write('{\n  "useRushReporter": true\n}\n');
    expect(readUseRushReporter(rushJsonPath)).toBe(true);
  });

  it('finds rush.json from a nested folder', () => {
    const nested: string = path.join(folder, 'common', 'config');
    expect(findRushJsonPath(nested)).toBe(path.join(folder, 'rush.json'));
  });
});
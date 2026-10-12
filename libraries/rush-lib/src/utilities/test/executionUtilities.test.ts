// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as childProcess from 'node:child_process';

import { IS_WINDOWS, quoteShellArgumentIfNeeded } from '../executionUtilities';

const POSIX_SAFE_ARGUMENTS: string[] = [
  '--test-path-pattern',
  'bump',
  'src/logic/foo.test.ts',
  '@scope/pkg',
  'a=b,c:d+e%',
  '1.2.3',
  '_x-Y'
];

const POSIX_QUOTED_ARGUMENTS: [string, string, string][] = [
  ['QP2', 'bump|x', "'bump|x'"],
  ['QP3', 'debarrel-(a|b)', "'debarrel-(a|b)'"],
  ['QP4', 'a b', "'a b'"],
  ['QP5', '$HOME', "'$HOME'"],
  ['QP6', '`id`', "'`id`'"],
  ['QP7', "it's", "'it'\\''s'"],
  ['QP8', 'say "hi"', '\'say "hi"\''],
  ['QP9', '*.ts', "'*.ts'"],
  ['QP9', '~/x', "'~/x'"],
  ['QP9', 'a;b&c>d<e', "'a;b&c>d<e'"],
  ['QP9', 'back\\slash', "'back\\slash'"],
  ['QP10', '', "''"],
  ['QP11', 'line1\nline2', "'line1\nline2'"]
];

const WINDOWS_SAFE_ARGUMENTS: string[] = [
  '--test-path-pattern',
  'bump',
  'C:\\repo\\src\\',
  '50%',
  '$HOME',
  "it's",
  '*.ts',
  'a;b,c=d'
];

const WINDOWS_QUOTED_ARGUMENTS: [string, string, string][] = [
  ['QW2', 'bump|x', '"bump|x"'],
  ['QW3', 'debarrel-(a|b)', '"debarrel-(a|b)"'],
  ['QW4', 'a b', '"a b"'],
  ['QW4', 'a&b', '"a&b"'],
  ['QW4', 'a^b', '"a^b"'],
  ['QW4', 'a<b>c', '"a<b>c"'],
  ['QW5', 'say "hi"', '"say ""hi"""'],
  ['QW6', 'C:\\dir with space\\', '"C:\\dir with space\\\\"'],
  ['QW7', 'a\\"b', '"a\\\\""b"'],
  ['QW8', '', '""'],
  ['A2', 'a\tb', '"a\tb"']
];

describe(quoteShellArgumentIfNeeded.name, () => {
  describe('POSIX', () => {
    it.each(POSIX_SAFE_ARGUMENTS)('QP1: leaves %j unchanged', (argument: string) => {
      expect(quoteShellArgumentIfNeeded(argument, false)).toEqual(argument);
    });

    it.each(POSIX_QUOTED_ARGUMENTS)('%s: quotes %j', (row: string, argument: string, expected: string) => {
      expect(quoteShellArgumentIfNeeded(argument, false)).toEqual(expected);
    });

    (IS_WINDOWS ? it.skip : it).each([
      ...POSIX_SAFE_ARGUMENTS,
      ...POSIX_QUOTED_ARGUMENTS.map(([, argument]) => argument)
    ])('R1: sh passes %j through as one literal argument', (argument: string) => {
      const result: childProcess.SpawnSyncReturns<string> = childProcess.spawnSync(
        'sh',
        ['-c', `set -- ${quoteShellArgumentIfNeeded(argument, false)}; printf '%s:%s' "$#" "$1"`],
        { encoding: 'utf8' }
      );
      expect(result.stderr).toEqual('');
      expect(result.status).toEqual(0);
      expect(result.stdout).toEqual(`1:${argument}`);
    });
  });

  describe('Windows', () => {
    it.each(WINDOWS_SAFE_ARGUMENTS)('QW1: leaves %j unchanged', (argument: string) => {
      expect(quoteShellArgumentIfNeeded(argument, true)).toEqual(argument);
    });

    it.each(WINDOWS_QUOTED_ARGUMENTS)('%s: quotes %j', (row: string, argument: string, expected: string) => {
      expect(quoteShellArgumentIfNeeded(argument, true)).toEqual(expected);
    });
  });
});

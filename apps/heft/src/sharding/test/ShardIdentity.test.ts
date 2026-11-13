// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';

import {
  formatShardPair,
  getShardFolderName,
  getShardTempFolderPath,
  parseShardPair
} from '../ShardIdentity';

describe('parseShardPair', () => {
  it.each([
    { value: '1/1', shardIndex: 1, shardCount: 1 },
    { value: '1/4', shardIndex: 1, shardCount: 4 },
    { value: '4/4', shardIndex: 4, shardCount: 4 },
    { value: '10/128', shardIndex: 10, shardCount: 128 },
    { value: '1/9007199254740991', shardIndex: 1, shardCount: Number.MAX_SAFE_INTEGER }
  ])('parses $value', ({ value, shardIndex, shardCount }) => {
    expect(parseShardPair(value)).toEqual({ shardIndex, shardCount });
  });

  it('parses the index as 1-based, matching Rush and every mainstream runner', () => {
    // If this ever became 0-based, shard "1/4" would silently run the second partition and
    // no partition would run the first, so the suite would pass while skipping tests.
    expect(parseShardPair('1/4').shardIndex).toBe(1);
  });

  it.each([
    { description: 'an empty string', value: '' },
    { description: 'a bare index', value: '2' },
    { description: 'a missing count', value: '2/' },
    { description: 'a missing index', value: '/4' },
    { description: 'a non-numeric count', value: '2/x' },
    { description: 'a negative index', value: '-2/4' },
    { description: 'a fractional index', value: '2.5/4' },
    { description: 'surrounding whitespace', value: ' 2/4 ' },
    { description: 'a trailing newline', value: '2/4\n' },
    { description: 'a trailing carriage return', value: '2/4\r' },
    { description: 'internal whitespace', value: '2 / 4' },
    { description: 'a backslash separator', value: '2\\4' }
  ])('rejects $description', ({ value }) => {
    expect(() => parseShardPair(value)).toThrow(/expected the format/);
  });

  it.each([
    { description: 'a leading junk segment', value: 'x/1/2' },
    { description: 'a trailing junk segment', value: '1/2/x' },
    { description: 'three numeric segments', value: '1/2/3' }
  ])('rejects $description rather than silently dropping it', ({ value }) => {
    // Jest's own parser splits on "/" and filters out the non-numeric segments before
    // checking that two remain, so it accepts "x/1/2" as shard 1 of 2. Accepting a typo as
    // a valid partition would run a fraction of the suite and report success.
    expect(() => parseShardPair(value)).toThrow(/expected the format/);
  });

  it.each([
    { description: 'a zero index', value: '0/4' },
    { description: 'a zero count', value: '0/0' },
    { description: 'a zero count with a valid index', value: '1/0' }
  ])('rejects $description because the syntax is 1-based', ({ value }) => {
    expect(() => parseShardPair(value)).toThrow(/1-based/);
  });

  it('rejects an index beyond the count', () => {
    expect(() => parseShardPair('5/4')).toThrow(
      'Invalid "--shard" value "5/4": the index 5 is greater than the count 4.'
    );
  });

  it('names the offending value so the message is actionable', () => {
    expect(() => parseShardPair('two/four')).toThrow('"two/four"');
  });

  it.each(['1/9007199254740992', '9007199254740992/9007199254740992', `1/${'9'.repeat(400)}`])(
    'rejects unsafe integers: %s',
    (value: string) => {
      expect(() => parseShardPair(value)).toThrow(/safe integers/);
    }
  );
});

describe('formatShardPair', () => {
  it.each(['1/1', '2/4', '10/128'])('round-trips %s', (value: string) => {
    expect(formatShardPair(parseShardPair(value))).toBe(value);
  });
});

describe('getShardFolderName', () => {
  it('derives a distinct folder per shard', () => {
    const names: string[] = [1, 2, 3, 4].map(getShardFolderName);
    expect(names).toEqual(['shard-1', 'shard-2', 'shard-3', 'shard-4']);
    expect(new Set(names).size).toBe(names.length);
  });

  describe('getShardTempFolderPath', () => {
    it('isolates both the shard index and partition count', () => {
      const root: string = path.resolve('temp');
      expect(getShardTempFolderPath(root, parseShardPair('2/4'))).toBe(path.join(root, 'shard-2-of-4'));
      expect(getShardTempFolderPath(root, parseShardPair('2/3'))).toBe(path.join(root, 'shard-2-of-3'));
      expect(getShardTempFolderPath(root, parseShardPair('1/4'))).toBe(path.join(root, 'shard-1-of-4'));
    });
  });
});

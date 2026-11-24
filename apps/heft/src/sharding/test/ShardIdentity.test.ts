// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';

import {
  formatShardPair,
  getShardFolderConfiguration,
  getShardFolderConfigurationFromOutputDirectory,
  getShardFolderConfigurationFromPrefix,
  getShardFolderName,
  getShardFolderPath,
  getShardTaskFolderPath,
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
  it('uses the supplied convention instead of introducing another layout', () => {
    expect([1, 2, 3, 4].map((index) => getShardFolderName(index))).toEqual(['1', '2', '3', '4']);
    expect(getShardFolderName(2, 'part-{shardIndex}')).toBe('part-2');
    expect(getShardFolderName(2, '{shardIndex}-results')).toBe('2-results');
  });

  it.each([
    '',
    'part-1',
    '{shardIndex}-{shardIndex}',
    '{shardCount}-{shardIndex}',
    '../{shardIndex}',
    'nested/{shardIndex}',
    'nested\\{shardIndex}'
  ])('rejects unsupported naming templates: %s', (template) => {
    expect(() => getShardFolderName(1, template)).toThrow();
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid index %s', (index) => {
    expect(() => getShardFolderName(index)).toThrow(/positive safe integer/);
  });
});

describe('shard folder configuration', () => {
  it.each([
    { parent: '.rush/operations/_phase_test/shards', template: '{shardIndex}' },
    { parent: 'temp/shards', template: 'part-{shardIndex}' },
    { parent: 'temp/other/../shards', template: 'part-{shardIndex}' }
  ])('keeps $parent relative and shares exact slot naming with Rush', ({ parent, template }) => {
    const configuration = getShardFolderConfiguration(parent, template);
    expect(configuration.shardParentFolder).toBe(parent);
    expect(path.isAbsolute(getShardFolderPath(configuration, 2))).toBe(false);
    const slot: string = getShardFolderPath(configuration, 2);
    expect(slot).toBe(path.join(parent, template.replace('{shardIndex}', '2')));
    expect(getShardTaskFolderPath(slot, 'test', 'jest')).toBe(path.join(slot, 'test', 'jest'));
    expect(getShardTaskFolderPath(slot, 'test', 'other')).not.toBe(
      getShardTaskFolderPath(slot, 'test', 'jest')
    );
  });

  it.each([
    {
      prefix: '.rush/operations/_phase_test/shards/',
      parent: '.rush/operations/_phase_test/shards',
      template: '{shardIndex}'
    },
    { prefix: 'temp/shards/part-', parent: 'temp/shards', template: 'part-{shardIndex}' },
    { prefix: 'temp\\shards\\part-', parent: 'temp\\shards', template: 'part-{shardIndex}' }
  ])('explicitly adapts the legacy Rush prefix $prefix', ({ prefix, parent, template }) => {
    const expected = { shardParentFolder: parent, shardFolderNameTemplate: template };
    expect(getShardFolderConfigurationFromPrefix(prefix)).toEqual(expected);
    expect(getShardFolderConfigurationFromOutputDirectory(`${prefix}2`, parseShardPair('2/4'))).toEqual(
      expected
    );
    expect(getShardFolderPath(expected, 2)).toBe(
      path.join(parent.replace(/\\/g, '/'), template.replace('{shardIndex}', '2'))
    );
  });

  it('removes exactly the index suffix, not decimal characters in the naming prefix', () => {
    expect(
      getShardFolderConfigurationFromOutputDirectory('temp/shards/part-122', parseShardPair('2/4'))
    ).toEqual({ shardParentFolder: 'temp/shards', shardFolderNameTemplate: 'part-12{shardIndex}' });
  });

  it.each(['temp/shards/1', 'temp/shards/part-2/', 'temp/shards/2-results'])(
    'rejects an exact legacy output not ending in the index: %s',
    (output) => {
      expect(() => getShardFolderConfigurationFromOutputDirectory(output, parseShardPair('2/4'))).toThrow(
        /must end with its shard index/
      );
    }
  );

  it.each(['', '.', '..', '../shards', 'temp/../../shards', '/shards', 'C:\\shards', 'C:shards'])(
    'rejects roots outside the project: %s',
    (parent) => {
      expect(() => getShardFolderConfiguration(parent, '{shardIndex}')).toThrow();
    }
  );

  it('rejects nested or multiple-token legacy layouts', () => {
    expect(() => getShardFolderConfigurationFromPrefix('temp/{shardIndex}/part-')).toThrow();
    expect(() => getShardFolderConfigurationFromPrefix('temp/shards/{shardIndex}-')).toThrow();
  });

  it.each([
    'CON',
    'prn',
    'AUX',
    'NUL',
    'COM1',
    'COM9',
    'LPT1',
    'LPT9',
    'COM\u00b9',
    'LPT\u00b2',
    'COM\u00b3',
    'CONIN$',
    'CONOUT$',
    'con.txt',
    'NuL.tar.gz',
    'COM1.json',
    'lpt9.output',
    'CON .txt'
  ])('rejects a reserved device parent component: %s', (name) => {
    expect(() => getShardFolderConfiguration(`out/${name}`, '{shardIndex}')).toThrow(
      /reserved Windows device names/
    );
    expect(() => getShardFolderConfiguration(`out\\${name}\\shards`, '{shardIndex}')).toThrow(
      /reserved Windows device names/
    );
  });

  it.each(['NUL.{shardIndex}', 'con.{shardIndex}.json', 'COM{shardIndex}', 'LPT{shardIndex}.output'])(
    'rejects expanded reserved device templates: %s',
    (template) => {
      expect(() => getShardFolderConfiguration('out', template)).toThrow(/reserved Windows device names/);
      expect(() => getShardFolderName(3, template)).toThrow(/reserved Windows device names/);
    }
  );

  it.each(['CONSOLE', 'NULL', 'COM0', 'COM10', 'LPT10', 'auxiliary', 'part-CON'])(
    'allows non-device names sharing a reserved prefix: %s',
    (name) => {
      expect(() => getShardFolderConfiguration(`out/${name}`, `${name}.{shardIndex}`)).not.toThrow();
    }
  );

  it.each(['', '.', '..', '../test', 'test\\other'])('rejects invalid producer names: %s', (name) => {
    expect(() => getShardTaskFolderPath('temp/shards/1', name, 'task')).toThrow();
    expect(() => getShardTaskFolderPath('temp/shards/1', 'test', name)).toThrow();
  });
});

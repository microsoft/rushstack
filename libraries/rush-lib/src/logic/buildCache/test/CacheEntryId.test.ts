// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('node:process', () => {
  return {
    ...jest.requireActual('node:process'),
    platform: 'dummyplatform',
    arch: 'dummyarch'
  };
});

import { CacheEntryId, type GetCacheEntryIdFunction } from '../CacheEntryId.ts';

describe(CacheEntryId.name, () => {
  describe('Valid pattern names', () => {
    describe.each([
      { projectName: 'project+name', note: 'without a scope' },
      { projectName: '@scope/project+name', note: 'with a scope' }
    ])('For a project name $note', ({ projectName }) =>
      it.each([
        undefined,
        '[hash]',
        '[projectName]_[hash]',
        '[phaseName:normalize]_[hash]',
        '[phaseName:trimPrefix]_[hash]',
        '[projectName:normalize]_[hash]',
        '[projectName:normalize]_[phaseName:normalize]_[hash]',
        '[projectName:normalize]_[phaseName:normalize]_[hash]_[os]_[arch]',
        '[projectName:normalize]_[phaseName:trimPrefix]_[hash]',
        'prefix/[projectName:normalize]_[hash]',
        'prefix/[projectName:normalize]_[phaseName:normalize]_[hash]',
        'prefix/[projectName:normalize]_[phaseName:trimPrefix]_[hash]',
        'prefix/[projectName]_[hash]',
        'prefix/[projectName]_[phaseName:normalize]_[hash]',
        'prefix/[projectName]_[phaseName:trimPrefix]_[hash]'
      ])('Handles pattern %s', (pattern) => {
        const getCacheEntryId: GetCacheEntryIdFunction = CacheEntryId.parsePattern(pattern);
        expect(
          getCacheEntryId({
            projectName,
            projectStateHash: '09d1ecee6d5f888fa6c35ca804b5dac7c3735ce3',
            phaseName: '_phase:compile'
          })
        ).toMatchSnapshot();
      })
    );
  });

  describe('Invalid pattern names', () => {
    it.each([
      'x',
      '[invalidTag]',
      'unstartedTag]',
      '[incompleteTag',
      '[hash:badAttribute]',
      '[hash:badAttribute:attr2]',
      '[projectName:badAttribute]',
      '[projectName:]',
      '[phaseName]',
      '[phaseName:]',
      '[phaseName:badAttribute]',
      '[:attr1]',
      '[projectName:attr1:attr2]',
      '/[hash]',
      '[os:attr]',
      '[arch:attr]',
      '~'
    ])('Throws an exception for an invalid pattern (%s)', (pattern) => {
      expect(() => CacheEntryId.parsePattern(pattern)).toThrowErrorMatchingSnapshot();
    });
  });
});

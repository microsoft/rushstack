// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CacheEntryId, GetCacheEntryIdFunction, IGenerateCacheEntryIdOptions } from '../CacheEntryId';

describe(CacheEntryId.name, () => {
  describe('Valid pattern names', () => {
    function validatePatternMatchesSnapshot(
      projectName: string,
      pattern?: string,
      generateCacheEntryIdOptions?: Partial<IGenerateCacheEntryIdOptions>
    ): void {
      const getCacheEntryId: GetCacheEntryIdFunction = CacheEntryId.parsePattern(pattern);
      expect(
        getCacheEntryId({
          projectName,
          projectStateHash: '09d1ecee6d5f888fa6c35ca804b5dac7c3735ce3',
          phaseName: '_phase:compile',
          ...generateCacheEntryIdOptions
        })
      ).toMatchSnapshot(pattern || 'no pattern');
    }

    // prettier-ignore
    it('Handles a cache entry name for a project name without a scope', () => {
      const projectName: string = 'project+name';
      validatePatternMatchesSnapshot(projectName);
      validatePatternMatchesSnapshot(projectName, '[hash]');
      validatePatternMatchesSnapshot(projectName, '[projectName]_[hash]');
      validatePatternMatchesSnapshot(projectName, '[phaseName:normalize]_[hash]');
      validatePatternMatchesSnapshot(projectName, '[phaseName:trimPrefix]_[hash]');
      validatePatternMatchesSnapshot(projectName, '[projectName:normalize]_[hash]');
      validatePatternMatchesSnapshot(projectName, '[projectName:normalize]_[phaseName:normalize]_[hash]');
      validatePatternMatchesSnapshot(projectName, '[projectName:normalize]_[phaseName:trimPrefix]_[hash]');
      validatePatternMatchesSnapshot(projectName, 'prefix/[projectName:normalize]_[hash]');
      validatePatternMatchesSnapshot(projectName, 'prefix/[projectName:normalize]_[phaseName:normalize]_[hash]');
      validatePatternMatchesSnapshot(projectName, 'prefix/[projectName:normalize]_[phaseName:trimPrefix]_[hash]');
      validatePatternMatchesSnapshot(projectName, 'prefix/[projectName]_[hash]');
      validatePatternMatchesSnapshot(projectName, 'prefix/[projectName]_[phaseName:normalize]_[hash]');
      validatePatternMatchesSnapshot(projectName, 'prefix/[projectName]_[phaseName:trimPrefix]_[hash]');
    });

    // prettier-ignore
    it('Handles a cache entry name for a project name with a scope', () => {
      const projectName: string = '@scope/project+name';
      validatePatternMatchesSnapshot(projectName);
      validatePatternMatchesSnapshot(projectName, '[hash]');
      validatePatternMatchesSnapshot(projectName, '[projectName]_[hash]');
      validatePatternMatchesSnapshot(projectName, '[phaseName:normalize]_[hash]');
      validatePatternMatchesSnapshot(projectName, '[phaseName:trimPrefix]_[hash]');
      validatePatternMatchesSnapshot(projectName, '[projectName:normalize]_[hash]');
      validatePatternMatchesSnapshot(projectName, '[projectName:normalize]_[phaseName:normalize]_[hash]');
      validatePatternMatchesSnapshot(projectName, '[projectName:normalize]_[phaseName:trimPrefix]_[hash]');
      validatePatternMatchesSnapshot(projectName, 'prefix/[projectName:normalize]_[hash]');
      validatePatternMatchesSnapshot(projectName, 'prefix/[projectName:normalize]_[phaseName:normalize]_[hash]');
      validatePatternMatchesSnapshot(projectName, 'prefix/[projectName:normalize]_[phaseName:trimPrefix]_[hash]');
      validatePatternMatchesSnapshot(projectName, 'prefix/[projectName]_[hash]');
      validatePatternMatchesSnapshot(projectName, 'prefix/[projectName]_[phaseName:normalize]_[hash]');
      validatePatternMatchesSnapshot(projectName, 'prefix/[projectName]_[phaseName:trimPrefix]_[hash]');
    });
  });

  describe('Invalid pattern names', () => {
    async function validateInvalidPatternErrorMatchesSnapshotAsync(pattern: string): Promise<void> {
      await expect(() => CacheEntryId.parsePattern(pattern)).toThrowErrorMatchingSnapshot();
    }

    it('Throws an exception for an invalid pattern', async () => {
      await validateInvalidPatternErrorMatchesSnapshotAsync('x');
      await validateInvalidPatternErrorMatchesSnapshotAsync('[invalidTag]');
      await validateInvalidPatternErrorMatchesSnapshotAsync('unstartedTag]');
      await validateInvalidPatternErrorMatchesSnapshotAsync('[incompleteTag');
      await validateInvalidPatternErrorMatchesSnapshotAsync('[hash:badAttribute]');
      await validateInvalidPatternErrorMatchesSnapshotAsync('[hash:badAttribute:attr2]');
      await validateInvalidPatternErrorMatchesSnapshotAsync('[projectName:badAttribute]');
      await validateInvalidPatternErrorMatchesSnapshotAsync('[projectName:]');
      await validateInvalidPatternErrorMatchesSnapshotAsync('[phaseName]');
      await validateInvalidPatternErrorMatchesSnapshotAsync('[phaseName:]');
      await validateInvalidPatternErrorMatchesSnapshotAsync('[phaseName:badAttribute]');
      await validateInvalidPatternErrorMatchesSnapshotAsync('[:attr1]');
      await validateInvalidPatternErrorMatchesSnapshotAsync('[projectName:attr1:attr2]');
      await validateInvalidPatternErrorMatchesSnapshotAsync('/[hash]');
      await validateInvalidPatternErrorMatchesSnapshotAsync('~');
    });
  });
});

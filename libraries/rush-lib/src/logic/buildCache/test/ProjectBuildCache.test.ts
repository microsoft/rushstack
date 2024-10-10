// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';

import type { BuildCacheConfiguration } from '../../../api/BuildCacheConfiguration';
import type { RushConfigurationProject } from '../../../api/RushConfigurationProject';
import type { IGenerateCacheEntryIdOptions } from '../CacheEntryId';
import type { FileSystemBuildCacheProvider } from '../FileSystemBuildCacheProvider';

import { ProjectBuildCache } from '../ProjectBuildCache';

interface ITestOptions {
  enabled: boolean;
  writeAllowed: boolean;
  trackedProjectFiles: string[] | undefined;
}

describe(ProjectBuildCache.name, () => {
  function prepareSubject(options: Partial<ITestOptions>): ProjectBuildCache {
    const terminal: Terminal = new Terminal(new StringBufferTerminalProvider());

    const subject: ProjectBuildCache = ProjectBuildCache.getProjectBuildCache({
      buildCacheConfiguration: {
        buildCacheEnabled: options.hasOwnProperty('enabled') ? options.enabled : true,
        getCacheEntryId: (opts: IGenerateCacheEntryIdOptions) =>
          `${opts.projectName}/${opts.projectStateHash}`,
        localCacheProvider: undefined as unknown as FileSystemBuildCacheProvider,
        cloudCacheProvider: {
          isCacheWriteAllowed: options.hasOwnProperty('writeAllowed') ? options.writeAllowed : false
        }
      } as unknown as BuildCacheConfiguration,
      projectOutputFolderNames: ['dist'],
      project: {
        packageName: 'acme-wizard',
        projectRelativeFolder: 'apps/acme-wizard',
        dependencyProjects: []
      } as unknown as RushConfigurationProject,
      // Value from past tests, for consistency.
      // The project build cache is not responsible for calculating this value.
      operationStateHash: '1926f30e8ed24cb47be89aea39e7efd70fcda075',
      terminal,
      phaseName: 'build'
    });

    return subject;
  }

  describe(ProjectBuildCache.getProjectBuildCache.name, () => {
    it('returns a ProjectBuildCache with a calculated cacheId value', () => {
      const subject: ProjectBuildCache = prepareSubject({});
      expect(subject['_cacheId']).toMatchInlineSnapshot(
        `"acme-wizard/1926f30e8ed24cb47be89aea39e7efd70fcda075"`
      );
    });
  });
});

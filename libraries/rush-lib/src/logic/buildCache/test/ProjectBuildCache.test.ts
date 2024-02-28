// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';

import type { BuildCacheConfiguration } from '../../../api/BuildCacheConfiguration';
import type { RushConfigurationProject } from '../../../api/RushConfigurationProject';
import { ProjectChangeAnalyzer } from '../../ProjectChangeAnalyzer';
import type { IGenerateCacheEntryIdOptions } from '../CacheEntryId';
import type { FileSystemBuildCacheProvider } from '../FileSystemBuildCacheProvider';

import { ProjectBuildCache } from '../ProjectBuildCache';

interface ITestOptions {
  enabled: boolean;
  writeAllowed: boolean;
  trackedProjectFiles: string[] | undefined;
}

describe(ProjectBuildCache.name, () => {
  async function prepareSubject(options: Partial<ITestOptions>): Promise<ProjectBuildCache | undefined> {
    const terminal: Terminal = new Terminal(new StringBufferTerminalProvider());
    const projectChangeAnalyzer = {
      [ProjectChangeAnalyzer.prototype._tryGetProjectStateHashAsync.name]: async () => {
        return 'state_hash';
      }
    } as unknown as ProjectChangeAnalyzer;

    const subject: ProjectBuildCache | undefined = await ProjectBuildCache.tryGetProjectBuildCache({
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
      configHash: 'build',
      projectChangeAnalyzer,
      terminal,
      phaseName: 'build'
    });

    return subject;
  }

  describe(ProjectBuildCache.tryGetProjectBuildCache.name, () => {
    it('returns a ProjectBuildCache with a calculated cacheId value', async () => {
      const subject: ProjectBuildCache = (await prepareSubject({}))!;
      expect(subject['_cacheId']).toMatchInlineSnapshot(
        `"acme-wizard/1926f30e8ed24cb47be89aea39e7efd70fcda075"`
      );
    });
  });
});

// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { StringBufferTerminalProvider, Terminal } from '@rushstack/node-core-library';
import { BuildCacheConfiguration } from '../../../api/BuildCacheConfiguration';
import { EnvironmentConfiguration } from '../../../api/EnvironmentConfiguration';
import { RushProjectConfiguration } from '../../../api/RushProjectConfiguration';
import { PackageChangeAnalyzer } from '../../../logic/PackageChangeAnalyzer';
import { IGenerateCacheEntryIdOptions } from '../CacheEntryId';
import { FileSystemBuildCacheProvider } from '../FileSystemBuildCacheProvider';

import { ProjectBuildCache } from '../ProjectBuildCache';

interface ITestOptions {
  enabled: boolean;
  writeAllowed: boolean;
  trackedProjectFiles: string[] | undefined;
}

describe('ProjectBuildCache', () => {
  function prepareSubject(options: Partial<ITestOptions>): ProjectBuildCache | undefined {
    const terminal: Terminal = new Terminal(new StringBufferTerminalProvider());
    const packageChangeAnalyzer = ({
      getProjectStateHash: () => {
        return 'state_hash';
      }
    } as unknown) as PackageChangeAnalyzer;

    const subject: ProjectBuildCache | undefined = ProjectBuildCache.tryGetProjectBuildCache({
      buildCacheConfiguration: ({
        buildCacheEnabled: options.hasOwnProperty('enabled') ? options.enabled : true,
        getCacheEntryId: (options: IGenerateCacheEntryIdOptions) =>
          `${options.projectName}/${options.projectStateHash}`,
        localCacheProvider: (undefined as unknown) as FileSystemBuildCacheProvider,
        cloudCacheProvider: {
          isCacheWriteAllowed: options.hasOwnProperty('writeAllowed') ? options.writeAllowed : false
        }
      } as unknown) as BuildCacheConfiguration,
      projectConfiguration: ({
        projectOutputFolderNames: ['dist'],
        project: {
          packageName: 'acme-wizard',
          projectRelativeFolder: 'apps/acme-wizard',
          dependencyProjects: []
        }
      } as unknown) as RushProjectConfiguration,
      command: 'build',
      trackedProjectFiles: options.hasOwnProperty('trackedProjectFiles') ? options.trackedProjectFiles : [],
      packageChangeAnalyzer,
      terminal
    });

    return subject;
  }

  describe('tryGetProjectBuildCache', () => {
    it('returns a ProjectBuildCache with a calculated cacheId value', () => {
      const subject: ProjectBuildCache = prepareSubject({})!;
      expect(subject['_cacheId']).toMatchInlineSnapshot(
        `"acme-wizard/e229f8765b7d450a8a84f711a81c21e37935d661"`
      );
    });

    it('returns undefined if the tracked file list is undefined', () => {
      expect(
        prepareSubject({
          trackedProjectFiles: undefined
        })
      ).toBe(undefined);
    });
  });

  describe('buildCacheEnabled', () => {
    function test(configValue: boolean, envValue: boolean | undefined, expectedValue: boolean): void {
      it(`returns ${expectedValue} if buildCacheEnabled=${configValue} and RUSH_BUILD_CACHE_ENABLED=${envValue}`, () => {
        jest.spyOn(EnvironmentConfiguration, 'buildCacheEnabled', 'get').mockReturnValue(envValue);
        const subject: ProjectBuildCache = prepareSubject({
          enabled: configValue
        })!;
        expect(subject.buildCacheEnabled).toBe(expectedValue);
      });
    }

    test(true, undefined, true);
    test(false, undefined, false);
    test(true, true, true);
    test(false, true, true);
    test(true, false, false);
    test(false, false, false);
  });
});

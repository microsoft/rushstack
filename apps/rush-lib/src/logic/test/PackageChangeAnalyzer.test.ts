// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { PackageChangeAnalyzer } from '../PackageChangeAnalyzer';
import { RushConfiguration } from '../../api/RushConfiguration';
import { EnvironmentConfiguration } from '../../api/EnvironmentConfiguration';
import { RushConfigurationProject } from '../../api/RushConfigurationProject';

describe('PackageChangeAnalyzer', () => {
  beforeEach(() => {
    jest.spyOn(EnvironmentConfiguration, 'gitBinaryPath', 'get').mockReturnValue(undefined);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  function createTestSubject(
    projects: RushConfigurationProject[],
    files: Map<string, string>
  ): PackageChangeAnalyzer {
    const rushConfiguration: RushConfiguration = {
      commonRushConfigFolder: '',
      projects,
      rushJsonFolder: '',
      getCommittedShrinkwrapFilename(): string {
        return 'common/config/rush/pnpm-lock.yaml';
      },
      findProjectForPosixRelativePath(path: string): object | undefined {
        return projects.find((project) => path.startsWith(project.projectRelativeFolder));
      }
    } as RushConfiguration;

    const subject: PackageChangeAnalyzer = new PackageChangeAnalyzer(rushConfiguration);

    subject['_getRepoDeps'] = jest.fn(() => {
      return files;
    });

    return subject;
  }

  describe('getPackageDeps', () => {
    it('returns the files for the specified project', () => {
      const projects: RushConfigurationProject[] = [
        { packageName: 'apple', projectRelativeFolder: 'apps/apple' } as RushConfigurationProject,
        { packageName: 'banana', projectRelativeFolder: 'apps/banana' } as RushConfigurationProject
      ];
      const files: Map<string, string> = new Map([
        ['apps/apple/core.js', 'a101'],
        ['apps/banana/peel.js', 'b201']
      ]);
      const subject: PackageChangeAnalyzer = createTestSubject(projects, files);

      expect(subject.getPackageDeps('apple')).toEqual(new Map([['apps/apple/core.js', 'a101']]));
      expect(subject.getPackageDeps('banana')).toEqual(new Map([['apps/banana/peel.js', 'b201']]));
    });

    it('includes the committed shrinkwrap file as a dep for all projects', () => {
      const projects: RushConfigurationProject[] = [
        { packageName: 'apple', projectRelativeFolder: 'apps/apple' } as RushConfigurationProject,
        { packageName: 'banana', projectRelativeFolder: 'apps/banana' } as RushConfigurationProject
      ];
      const files: Map<string, string> = new Map([
        ['apps/apple/core.js', 'a101'],
        ['apps/banana/peel.js', 'b201'],
        ['common/config/rush/pnpm-lock.yaml', 'ffff'],
        ['tools/random-file.js', 'e00e']
      ]);
      const subject: PackageChangeAnalyzer = createTestSubject(projects, files);

      expect(subject.getPackageDeps('apple')).toEqual(
        new Map([
          ['apps/apple/core.js', 'a101'],
          ['common/config/rush/pnpm-lock.yaml', 'ffff']
        ])
      );
      expect(subject.getPackageDeps('banana')).toEqual(
        new Map([
          ['apps/banana/peel.js', 'b201'],
          ['common/config/rush/pnpm-lock.yaml', 'ffff']
        ])
      );
    });

    it('returns undefined if the specified project does not exist', () => {
      const projects: RushConfigurationProject[] = [
        { packageName: 'apple', projectRelativeFolder: 'apps/apple' } as RushConfigurationProject
      ];
      const files: Map<string, string> = new Map([['apps/apple/core.js', 'a101']]);
      const subject: PackageChangeAnalyzer = createTestSubject(projects, files);

      expect(subject.getPackageDeps('carrot')).toBeUndefined();
    });

    it('lazy-loads project data and caches it for future calls', () => {
      const projects: RushConfigurationProject[] = [
        { packageName: 'apple', projectRelativeFolder: 'apps/apple' } as RushConfigurationProject
      ];
      const files: Map<string, string> = new Map([['apps/apple/core.js', 'a101']]);
      const subject: PackageChangeAnalyzer = createTestSubject(projects, files);

      // Because other unit tests rely on the fact that a freshly instantiated
      // PackageChangeAnalyzer is inert until someone actually requests project data,
      // this test makes that expectation explicit.

      expect(subject['_data']).toBeNull();
      expect(subject.getPackageDeps('apple')).toEqual(new Map([['apps/apple/core.js', 'a101']]));
      expect(subject['_data']).toBeDefined();
      expect(subject.getPackageDeps('apple')).toEqual(new Map([['apps/apple/core.js', 'a101']]));
      expect(subject['_getRepoDeps']).toHaveBeenCalledTimes(1);
    });
  });

  describe('getProjectStateHash', () => {
    it('returns a fixed hash snapshot for a set of project deps', () => {
      const projects: RushConfigurationProject[] = [
        { packageName: 'apple', projectRelativeFolder: 'apps/apple' } as RushConfigurationProject
      ];
      const files: Map<string, string> = new Map([
        ['apps/apple/core.js', 'a101'],
        ['apps/apple/juice.js', 'e333'],
        ['apps/apple/slices.js', 'a102']
      ]);
      const subject: PackageChangeAnalyzer = createTestSubject(projects, files);

      expect(subject.getProjectStateHash('apple')).toMatchInlineSnapshot(
        `"265536e325cdfac3fa806a51873d927a712fc6c9"`
      );
    });

    it('returns the same hash regardless of dep order', () => {
      const projectsA: RushConfigurationProject[] = [
        { packageName: 'apple', projectRelativeFolder: 'apps/apple' } as RushConfigurationProject
      ];
      const filesA: Map<string, string> = new Map([
        ['apps/apple/core.js', 'a101'],
        ['apps/apple/juice.js', 'e333'],
        ['apps/apple/slices.js', 'a102']
      ]);
      const subjectA: PackageChangeAnalyzer = createTestSubject(projectsA, filesA);

      const projectsB: RushConfigurationProject[] = [
        { packageName: 'apple', projectRelativeFolder: 'apps/apple' } as RushConfigurationProject
      ];
      const filesB: Map<string, string> = new Map([
        ['apps/apple/slices.js', 'a102'],
        ['apps/apple/core.js', 'a101'],
        ['apps/apple/juice.js', 'e333']
      ]);
      const subjectB: PackageChangeAnalyzer = createTestSubject(projectsB, filesB);

      expect(subjectA.getProjectStateHash('apple')).toEqual(subjectB.getProjectStateHash('apple'));
    });
  });
});

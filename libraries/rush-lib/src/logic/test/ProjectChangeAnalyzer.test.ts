// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const mockHashes: Map<string, string> = new Map([
  ['a/package.json', 'hash1'],
  ['b/package.json', 'hash2'],
  ['c/package.json', 'hash3'],
  ['changes/a.json', 'hash4'],
  ['changes/b.json', 'hash5'],
  ['changes/c.json', 'hash6'],
  ['changes/d.json', 'hash7'],
  ['changes/h.json', 'hash8'],
  ['common/config/rush/version-policies.json', 'hash9'],
  ['common/config/rush/npm-shrinkwrap.json', 'hash10'],
  ['d/package.json', 'hash11'],
  ['e/package.json', 'hash12'],
  ['f/package.json', 'hash13'],
  ['g/package.json', 'hash14'],
  ['h/package.json', 'hash15'],
  ['i/package.json', 'hash16'],
  ['j/package.json', 'hash17'],
  ['rush.json', 'hash18']
]);

// Mock function for customizing repo changes in each test
const mockGetRepoChanges = jest.fn<Map<string, IFileDiffStatus>, []>();

jest.mock(`@rushstack/package-deps-hash`, () => {
  return {
    getRepoRoot(dir: string): string {
      return dir;
    },
    getDetailedRepoStateAsync(): IDetailedRepoState {
      return {
        hasSubmodules: false,
        hasUncommittedChanges: false,
        files: mockHashes,
        symlinks: new Map()
      };
    },
    getRepoChangesAsync(): ReadonlyMap<string, string> {
      return new Map();
    },
    getGitHashForFiles(filePaths: Iterable<string>): ReadonlyMap<string, string> {
      return new Map(Array.from(filePaths, (filePath: string) => [filePath, filePath]));
    },
    hashFilesAsync(rootDirectory: string, filePaths: Iterable<string>): ReadonlyMap<string, string> {
      return new Map(Array.from(filePaths, (filePath: string) => [filePath, filePath]));
    },
    getRepoChanges(): Map<string, IFileDiffStatus> {
      return mockGetRepoChanges();
    }
  };
});

const { Git: OriginalGit } = jest.requireActual('../Git');

// Mock function for getBlobContentAsync to be customized in each test
const mockGetBlobContentAsync = jest.fn<Promise<string>, [{ blobSpec: string; repositoryRoot: string }]>();

/** Mock Git to test `getChangedProjectsAsync` */
jest.mock('../Git', () => {
  return {
    Git: class MockGit extends OriginalGit {
      public async determineIfRefIsACommitAsync(ref: string): Promise<boolean> {
        return true;
      }
      public async getMergeBaseAsync(ref1: string, ref2: string): Promise<string> {
        return 'merge-base-sha';
      }
      public async getBlobContentAsync(opts: { blobSpec: string; repositoryRoot: string }): Promise<string> {
        return mockGetBlobContentAsync(opts);
      }
    }
  };
});

const OriginalPnpmShrinkwrapFile: typeof PnpmShrinkwrapFile = jest.requireActual(
  '../pnpm/PnpmShrinkwrapFile'
).PnpmShrinkwrapFile;
jest.mock('../pnpm/PnpmShrinkwrapFile', () => {
  return {
    PnpmShrinkwrapFile: {
      loadFromFile: (fullShrinkwrapPath: string, options: ILoadFromFileOptions): PnpmShrinkwrapFile => {
        return OriginalPnpmShrinkwrapFile.loadFromString(_getMockedPnpmShrinkwrapFile(), options);
      },
      loadFromString: (text: string, options: ILoadFromStringOptions): PnpmShrinkwrapFile => {
        return OriginalPnpmShrinkwrapFile.loadFromString(
          _getMockedPnpmShrinkwrapFile()
            // Change dependencies version
            .replace(/1\.0\.1/g, '1.0.0')
            .replace(/foo_1_0_1/g, 'foo_1_0_0'),
          options
        );
      }
    }
  };
});

const mockSnapshot: jest.Mock = jest.fn();

jest.mock('../incremental/InputsSnapshot', () => {
  return {
    InputsSnapshot: mockSnapshot
  };
});

import { resolve } from 'node:path';

import type { IDetailedRepoState, IFileDiffStatus } from '@rushstack/package-deps-hash';
import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';

import { ProjectChangeAnalyzer } from '../ProjectChangeAnalyzer';
import { RushConfiguration } from '../../api/RushConfiguration';
import type {
  IInputsSnapshot,
  GetInputsSnapshotAsyncFn,
  IInputsSnapshotParameters
} from '../incremental/InputsSnapshot';
import type {
  ILoadFromFileOptions,
  ILoadFromStringOptions,
  PnpmShrinkwrapFile
} from '../pnpm/PnpmShrinkwrapFile';

describe(ProjectChangeAnalyzer.name, () => {
  beforeEach(() => {
    mockSnapshot.mockClear();
    mockGetBlobContentAsync.mockClear();
    mockGetRepoChanges.mockClear();
  });

  describe(ProjectChangeAnalyzer.prototype._tryGetSnapshotProviderAsync.name, () => {
    it('returns a snapshot', async () => {
      const rootDir: string = resolve(__dirname, 'repo');
      const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
        resolve(rootDir, 'rush.json')
      );
      const projectChangeAnalyzer: ProjectChangeAnalyzer = new ProjectChangeAnalyzer(rushConfiguration);
      const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider(true);
      const terminal: Terminal = new Terminal(terminalProvider);
      const mockSnapshotValue: {} = {};
      mockSnapshot.mockImplementation(() => mockSnapshotValue);
      const snapshotProvider: GetInputsSnapshotAsyncFn | undefined =
        await projectChangeAnalyzer._tryGetSnapshotProviderAsync(new Map(), terminal);
      const snapshot: IInputsSnapshot | undefined = await snapshotProvider?.();

      expect(snapshot).toBe(mockSnapshotValue);
      expect(terminalProvider.getAllOutput(true)).toEqual({});
      expect(mockSnapshot).toHaveBeenCalledTimes(1);

      const mockInput: IInputsSnapshotParameters = mockSnapshot.mock.calls[0][0];
      expect(mockInput.globalAdditionalFiles).toBeDefined();
      expect(mockInput.globalAdditionalFiles).toMatchObject(['common/config/rush/npm-shrinkwrap.json']);

      expect(mockInput.hashes).toEqual(mockHashes);
      expect(mockInput.rootDir).toEqual(rootDir);
      expect(mockInput.additionalHashes).toEqual(new Map());
    });
  });

  describe(ProjectChangeAnalyzer.prototype.getChangedProjectsAsync.name, () => {
    it('Subspaces detects external changes', async () => {
      // Set up mock repo changes for this test
      mockGetRepoChanges.mockReturnValue(
        new Map<string, IFileDiffStatus>([
          [
            // Test subspace lockfile change detection
            'common/config/subspaces/project-change-analyzer-test-subspace/pnpm-lock.yaml',
            {
              mode: 'modified',
              newhash: 'newhash',
              oldhash: 'oldhash',
              status: 'M'
            }
          ],
          [
            // Test lockfile deletion detection
            'common/config/subspaces/default/pnpm-lock.yaml',
            {
              mode: 'deleted',
              newhash: '',
              oldhash: 'oldhash',
              status: 'D'
            }
          ]
        ])
      );

      const rootDir: string = resolve(__dirname, 'repoWithSubspaces');
      const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
        resolve(rootDir, 'rush.json')
      );
      const projectChangeAnalyzer: ProjectChangeAnalyzer = new ProjectChangeAnalyzer(rushConfiguration);

      const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider(true);
      const terminal: Terminal = new Terminal(terminalProvider);

      const changedProjects = await projectChangeAnalyzer.getChangedProjectsAsync({
        enableFiltering: false,
        includeExternalDependencies: true,
        targetBranchName: 'main',
        terminal
      });

      // a,b,c is included because of change modifier is not modified
      // d is included because its dependency foo version changed in the subspace lockfile
      ['a', 'b', 'c', 'd'].forEach((projectName) => {
        expect(changedProjects.has(rushConfiguration.getProjectByName(projectName)!)).toBe(true);
      });

      // e depends on d via workspace:*, but its calculated lockfile (e.g. "e/.rush/temp/shrinkwrap-deps.json") didn't change.
      // So it's not included. e will be included by `expandConsumers` if needed.
      ['e', 'f'].forEach((projectName) => {
        expect(changedProjects.has(rushConfiguration.getProjectByName(projectName)!)).toBe(false);
      });
    });

    it('excludeVersionOnlyChanges excludes projects with only version field changes', async () => {
      const rootDir: string = resolve(__dirname, 'repo');
      const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
        resolve(rootDir, 'rush.json')
      );

      // Mock package.json with only version change
      const oldPackageJsonContent = JSON.stringify(
        {
          name: 'a',
          version: '1.0.0',
          description: 'Test package',
          dependencies: {
            b: '1.0.0'
          }
        },
        null,
        2
      );

      const newPackageJsonContent = JSON.stringify(
        {
          name: 'a',
          version: '1.0.1',
          description: 'Test package',
          dependencies: {
            b: '1.0.0'
          }
        },
        null,
        2
      );

      // Set up mock repo changes - only package.json changed for project 'a'
      mockGetRepoChanges.mockReturnValue(
        new Map<string, IFileDiffStatus>([
          [
            'a/package.json',
            {
              mode: 'modified',
              newhash: 'newhash1',
              oldhash: 'oldhash1',
              status: 'M'
            }
          ]
        ])
      );

      // Mock the blob content to return different versions based on the hash
      mockGetBlobContentAsync.mockImplementation((opts: { blobSpec: string; repositoryRoot: string }) => {
        if (opts.blobSpec === 'oldhash1') {
          return Promise.resolve(oldPackageJsonContent);
        } else if (opts.blobSpec === 'newhash1') {
          return Promise.resolve(newPackageJsonContent);
        }
        return Promise.resolve('');
      });

      const projectChangeAnalyzer: ProjectChangeAnalyzer = new ProjectChangeAnalyzer(rushConfiguration);
      const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider(true);
      const terminal: Terminal = new Terminal(terminalProvider);

      // Test without excludeVersionOnlyChanges - project should be detected as changed
      const changedProjectsWithoutExclude = await projectChangeAnalyzer.getChangedProjectsAsync({
        enableFiltering: false,
        includeExternalDependencies: false,
        targetBranchName: 'main',
        terminal
      });
      expect(changedProjectsWithoutExclude.has(rushConfiguration.getProjectByName('a')!)).toBe(true);

      // Test with excludeVersionOnlyChanges - project should NOT be detected as changed
      const changedProjectsWithExclude = await projectChangeAnalyzer.getChangedProjectsAsync({
        enableFiltering: false,
        includeExternalDependencies: false,
        targetBranchName: 'main',
        terminal,
        excludeVersionOnlyChanges: true
      });
      expect(changedProjectsWithExclude.has(rushConfiguration.getProjectByName('a')!)).toBe(false);
    });

    it('excludeVersionOnlyChanges does not exclude projects with non-version changes', async () => {
      const rootDir: string = resolve(__dirname, 'repo');
      const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
        resolve(rootDir, 'rush.json')
      );

      // Mock package.json with version AND dependency change
      const oldPackageJsonContent = JSON.stringify(
        {
          name: 'b',
          version: '1.0.0',
          description: 'Test package',
          dependencies: {
            a: '1.0.0'
          }
        },
        null,
        2
      );

      const newPackageJsonContent = JSON.stringify(
        {
          name: 'b',
          version: '1.0.1',
          description: 'Test package',
          dependencies: {
            a: '1.0.1' // Dependency version also changed
          }
        },
        null,
        2
      );

      // Set up mock repo changes - only package.json changed for project 'b'
      mockGetRepoChanges.mockReturnValue(
        new Map<string, IFileDiffStatus>([
          [
            'b/package.json',
            {
              mode: 'modified',
              newhash: 'newhash2',
              oldhash: 'oldhash2',
              status: 'M'
            }
          ]
        ])
      );

      // Mock the blob content to return different versions based on the hash
      mockGetBlobContentAsync.mockImplementation((opts: { blobSpec: string; repositoryRoot: string }) => {
        if (opts.blobSpec === 'oldhash2') {
          return Promise.resolve(oldPackageJsonContent);
        } else if (opts.blobSpec === 'newhash2') {
          return Promise.resolve(newPackageJsonContent);
        }
        return Promise.resolve('');
      });

      const projectChangeAnalyzer: ProjectChangeAnalyzer = new ProjectChangeAnalyzer(rushConfiguration);
      const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider(true);
      const terminal: Terminal = new Terminal(terminalProvider);

      // Test with excludeVersionOnlyChanges - project should still be detected as changed
      const changedProjects = await projectChangeAnalyzer.getChangedProjectsAsync({
        enableFiltering: false,
        includeExternalDependencies: false,
        targetBranchName: 'main',
        terminal,
        excludeVersionOnlyChanges: true
      });
      expect(changedProjects.has(rushConfiguration.getProjectByName('b')!)).toBe(true);
    });
  });
});

/**
 * Create a fake pnpm-lock.yaml content matches "libraries/rush-lib/src/logic/test/repoWithSubspaces" test repo
 */
function _getMockedPnpmShrinkwrapFile(): string {
  return `lockfileVersion: '9.0'

settings:
  autoInstallPeers: false
  excludeLinksFromLockfile: false

importers:

  .: {}

  ../../../d:
    dependencies:
      foo:
        specifier: ~1.0.0
        version: 1.0.1

  ../../../e:
    dependencies:
      d:
        specifier: workspace:*
        version: link:../../../d

  ../../../f:
    dependencies:

packages:

  foo@1.0.1:
    resolution: {integrity: 'foo_1_0_1'}

snapshots:

  foo@1.0.1: {}
`;
}

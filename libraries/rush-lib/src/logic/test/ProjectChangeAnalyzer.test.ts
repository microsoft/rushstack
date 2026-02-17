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
const mockGetRepoChanges: jest.MockedFunction<typeof import('@rushstack/package-deps-hash').getRepoChanges> =
  jest.fn();

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
    getRepoChanges(
      currentWorkingDirectory: string,
      revision?: string,
      gitPath?: string
    ): Map<string, IFileDiffStatus> {
      return mockGetRepoChanges(currentWorkingDirectory, revision, gitPath);
    }
  };
});

const { Git: OriginalGit } = jest.requireActual('../Git');

// Mock function for getBlobContentAsync to be customized in each test
const mockGetBlobContentAsync: jest.MockedFunction<
  typeof import('../Git').Git.prototype.getBlobContentAsync
> = jest.fn();

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

import { ProjectChangeAnalyzer, isPackageJsonVersionOnlyChange } from '../ProjectChangeAnalyzer';
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

    it('excludeVersionOnlyChanges does not exclude projects when package.json and other files changed', async () => {
      const rootDir: string = resolve(__dirname, 'repo');
      const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
        resolve(rootDir, 'rush.json')
      );

      // Mock package.json with only version change
      const oldPackageJsonContent = JSON.stringify(
        {
          name: 'c',
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
          name: 'c',
          version: '1.0.1',
          description: 'Test package',
          dependencies: {
            a: '1.0.0'
          }
        },
        null,
        2
      );

      // Set up mock repo changes - package.json AND another file changed for project 'c'
      mockGetRepoChanges.mockReturnValue(
        new Map<string, IFileDiffStatus>([
          [
            'c/package.json',
            {
              mode: 'modified',
              newhash: 'newhash3',
              oldhash: 'oldhash3',
              status: 'M'
            }
          ],
          [
            'c/src/index.ts',
            {
              mode: 'modified',
              newhash: 'newhash4',
              oldhash: 'oldhash4',
              status: 'M'
            }
          ]
        ])
      );

      // Mock the blob content to return different versions based on the hash
      mockGetBlobContentAsync.mockImplementation((opts: { blobSpec: string; repositoryRoot: string }) => {
        if (opts.blobSpec === 'oldhash3') {
          return Promise.resolve(oldPackageJsonContent);
        } else if (opts.blobSpec === 'newhash3') {
          return Promise.resolve(newPackageJsonContent);
        }
        return Promise.resolve('');
      });

      const projectChangeAnalyzer: ProjectChangeAnalyzer = new ProjectChangeAnalyzer(rushConfiguration);
      const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider(true);
      const terminal: Terminal = new Terminal(terminalProvider);

      // Test with excludeVersionOnlyChanges - project should still be detected as changed because multiple files changed
      const changedProjects = await projectChangeAnalyzer.getChangedProjectsAsync({
        enableFiltering: false,
        includeExternalDependencies: false,
        targetBranchName: 'main',
        terminal,
        excludeVersionOnlyChanges: true
      });
      expect(changedProjects.has(rushConfiguration.getProjectByName('c')!)).toBe(true);
    });

    it('excludeVersionOnlyChanges ignores CHANGELOG.md and CHANGELOG.json files', async () => {
      const rootDir: string = resolve(__dirname, 'repo');
      const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
        resolve(rootDir, 'rush.json')
      );

      // Mock package.json with only version change
      const oldPackageJsonContent = JSON.stringify({
        name: 'd',
        version: '1.0.0',
        description: 'Test package'
      });

      const newPackageJsonContent = JSON.stringify({
        name: 'd',
        version: '1.0.1',
        description: 'Test package'
      });

      // Set up mock repo changes - package.json (version only), CHANGELOG.md, and CHANGELOG.json changed
      mockGetRepoChanges.mockReturnValue(
        new Map<string, IFileDiffStatus>([
          [
            'd/package.json',
            {
              mode: 'modified',
              newhash: 'newhash4',
              oldhash: 'oldhash4',
              status: 'M'
            }
          ],
          [
            'd/CHANGELOG.md',
            {
              mode: 'modified',
              newhash: 'newhash5',
              oldhash: 'oldhash5',
              status: 'M'
            }
          ],
          [
            'd/CHANGELOG.json',
            {
              mode: 'modified',
              newhash: 'newhash6',
              oldhash: 'oldhash6',
              status: 'M'
            }
          ]
        ])
      );

      // Mock the blob content to return different versions based on the hash
      mockGetBlobContentAsync.mockImplementation((opts: { blobSpec: string; repositoryRoot: string }) => {
        if (opts.blobSpec === 'oldhash4') {
          return Promise.resolve(oldPackageJsonContent);
        } else if (opts.blobSpec === 'newhash4') {
          return Promise.resolve(newPackageJsonContent);
        }
        return Promise.resolve('');
      });

      const projectChangeAnalyzer: ProjectChangeAnalyzer = new ProjectChangeAnalyzer(rushConfiguration);
      const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider(true);
      const terminal: Terminal = new Terminal(terminalProvider);

      // Test with excludeVersionOnlyChanges - project should NOT be detected as changed
      // because only version-only package.json and CHANGELOG files changed
      const changedProjects = await projectChangeAnalyzer.getChangedProjectsAsync({
        enableFiltering: false,
        includeExternalDependencies: false,
        targetBranchName: 'main',
        terminal,
        excludeVersionOnlyChanges: true
      });
      expect(changedProjects.has(rushConfiguration.getProjectByName('d')!)).toBe(false);
    });

    it('excludeVersionOnlyChanges does not ignore projects with CHANGELOG and other substantive changes', async () => {
      const rootDir: string = resolve(__dirname, 'repo');
      const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
        resolve(rootDir, 'rush.json')
      );

      // Set up mock repo changes - CHANGELOG.md and src file changed
      mockGetRepoChanges.mockReturnValue(
        new Map<string, IFileDiffStatus>([
          [
            'e/CHANGELOG.md',
            {
              mode: 'modified',
              newhash: 'newhash7',
              oldhash: 'oldhash7',
              status: 'M'
            }
          ],
          [
            'e/src/index.ts',
            {
              mode: 'modified',
              newhash: 'newhash8',
              oldhash: 'oldhash8',
              status: 'M'
            }
          ]
        ])
      );

      const projectChangeAnalyzer: ProjectChangeAnalyzer = new ProjectChangeAnalyzer(rushConfiguration);
      const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider(true);
      const terminal: Terminal = new Terminal(terminalProvider);

      // Test with excludeVersionOnlyChanges - project should be detected as changed
      // because there's a substantive change in addition to CHANGELOG
      const changedProjects = await projectChangeAnalyzer.getChangedProjectsAsync({
        enableFiltering: false,
        includeExternalDependencies: false,
        targetBranchName: 'main',
        terminal,
        excludeVersionOnlyChanges: true
      });
      expect(changedProjects.has(rushConfiguration.getProjectByName('e')!)).toBe(true);
    });

    describe('catalog change detection', () => {
      it('detects projects using a changed catalog entry', async () => {
        const rootDir: string = resolve(__dirname, 'repoWithCatalogs');
        const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
          resolve(rootDir, 'rush.json')
        );

        // pnpm-config.json changed
        mockGetRepoChanges.mockReturnValue(
          new Map<string, IFileDiffStatus>([
            [
              'common/config/rush/pnpm-config.json',
              {
                mode: 'modified',
                newhash: 'newhash',
                oldhash: 'oldhash',
                status: 'M'
              }
            ]
          ])
        );

        // Old config had react ^17.0.0, now it's ^18.0.0
        mockGetBlobContentAsync.mockImplementation(() => {
          return Promise.resolve(
            JSON.stringify({
              globalCatalogs: {
                default: {
                  react: '^17.0.0',
                  lodash: '^4.17.21'
                },
                tools: {
                  typescript: '~5.3.0'
                }
              }
            })
          );
        });

        const projectChangeAnalyzer: ProjectChangeAnalyzer = new ProjectChangeAnalyzer(rushConfiguration);
        const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider(true);
        const terminal: Terminal = new Terminal(terminalProvider);

        const changedProjects = await projectChangeAnalyzer.getChangedProjectsAsync({
          enableFiltering: false,
          includeExternalDependencies: false,
          targetBranchName: 'main',
          terminal
        });

        // Project 'a' uses catalog:default (react changed)
        expect(changedProjects.has(rushConfiguration.getProjectByName('a')!)).toBe(true);
      });

      it('does not detect projects using an unchanged catalog', async () => {
        const rootDir: string = resolve(__dirname, 'repoWithCatalogs');
        const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
          resolve(rootDir, 'rush.json')
        );

        // pnpm-config.json changed
        mockGetRepoChanges.mockReturnValue(
          new Map<string, IFileDiffStatus>([
            [
              'common/config/rush/pnpm-config.json',
              {
                mode: 'modified',
                newhash: 'newhash',
                oldhash: 'oldhash',
                status: 'M'
              }
            ]
          ])
        );

        // Only the tools catalog changed (typescript version), default catalog is identical
        mockGetBlobContentAsync.mockImplementation(() => {
          return Promise.resolve(
            JSON.stringify({
              globalCatalogs: {
                default: {
                  react: '^18.0.0',
                  lodash: '^4.17.21'
                },
                tools: {
                  typescript: '~5.2.0'
                }
              }
            })
          );
        });

        const projectChangeAnalyzer: ProjectChangeAnalyzer = new ProjectChangeAnalyzer(rushConfiguration);
        const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider(true);
        const terminal: Terminal = new Terminal(terminalProvider);

        const changedProjects = await projectChangeAnalyzer.getChangedProjectsAsync({
          enableFiltering: false,
          includeExternalDependencies: false,
          targetBranchName: 'main',
          terminal
        });

        // Project 'b' uses catalog:tools (typescript changed)
        expect(changedProjects.has(rushConfiguration.getProjectByName('b')!)).toBe(true);
        // Project 'a' uses catalog:default (unchanged)
        expect(changedProjects.has(rushConfiguration.getProjectByName('a')!)).toBe(false);
        // Project 'c' has no catalog deps
        expect(changedProjects.has(rushConfiguration.getProjectByName('c')!)).toBe(false);
      });

      it('treats all catalogs as changed when old pnpm-config.json does not exist', async () => {
        const rootDir: string = resolve(__dirname, 'repoWithCatalogs');
        const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
          resolve(rootDir, 'rush.json')
        );

        // pnpm-config.json was newly created
        mockGetRepoChanges.mockReturnValue(
          new Map<string, IFileDiffStatus>([
            [
              'common/config/rush/pnpm-config.json',
              {
                mode: 'added',
                newhash: 'newhash',
                oldhash: '',
                status: 'A'
              }
            ]
          ])
        );

        // Simulate file not existing in old commit
        mockGetBlobContentAsync.mockImplementation(() => {
          return Promise.reject(new Error('fatal: path not found'));
        });

        const projectChangeAnalyzer: ProjectChangeAnalyzer = new ProjectChangeAnalyzer(rushConfiguration);
        const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider(true);
        const terminal: Terminal = new Terminal(terminalProvider);

        const changedProjects = await projectChangeAnalyzer.getChangedProjectsAsync({
          enableFiltering: false,
          includeExternalDependencies: false,
          targetBranchName: 'main',
          terminal
        });

        // All catalog-using projects should be detected
        expect(changedProjects.has(rushConfiguration.getProjectByName('a')!)).toBe(true);
        expect(changedProjects.has(rushConfiguration.getProjectByName('b')!)).toBe(true);
        // Project 'c' has no catalog deps, still not detected
        expect(changedProjects.has(rushConfiguration.getProjectByName('c')!)).toBe(false);
      });

      it('does not detect additional projects when pnpm-config.json is not changed', async () => {
        const rootDir: string = resolve(__dirname, 'repoWithCatalogs');
        const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
          resolve(rootDir, 'rush.json')
        );

        // Only a source file changed, not pnpm-config.json
        mockGetRepoChanges.mockReturnValue(
          new Map<string, IFileDiffStatus>([
            [
              'c/src/index.ts',
              {
                mode: 'modified',
                newhash: 'newhash',
                oldhash: 'oldhash',
                status: 'M'
              }
            ]
          ])
        );

        const projectChangeAnalyzer: ProjectChangeAnalyzer = new ProjectChangeAnalyzer(rushConfiguration);
        const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider(true);
        const terminal: Terminal = new Terminal(terminalProvider);

        const changedProjects = await projectChangeAnalyzer.getChangedProjectsAsync({
          enableFiltering: false,
          includeExternalDependencies: false,
          targetBranchName: 'main',
          terminal
        });

        // Only project 'c' should be detected (direct file change)
        expect(changedProjects.has(rushConfiguration.getProjectByName('c')!)).toBe(true);
        expect(changedProjects.has(rushConfiguration.getProjectByName('a')!)).toBe(false);
        expect(changedProjects.has(rushConfiguration.getProjectByName('b')!)).toBe(false);
      });
    });
  });

  describe('isPackageJsonVersionOnlyChange', () => {
    it('returns true when only version field changed', () => {
      const oldContent = JSON.stringify({
        name: 'test-package',
        version: '1.0.0',
        description: 'Test package',
        dependencies: { foo: '1.0.0' }
      });
      const newContent = JSON.stringify({
        name: 'test-package',
        version: '1.0.1',
        description: 'Test package',
        dependencies: { foo: '1.0.0' }
      });

      expect(isPackageJsonVersionOnlyChange(oldContent, newContent)).toBe(true);
    });

    it('returns false when other fields changed', () => {
      const oldContent = JSON.stringify({
        name: 'test-package',
        version: '1.0.0',
        description: 'Test package',
        dependencies: { foo: '1.0.0' }
      });
      const newContent = JSON.stringify({
        name: 'test-package',
        version: '1.0.1',
        description: 'Test package',
        dependencies: { foo: '1.0.1' }
      });

      expect(isPackageJsonVersionOnlyChange(oldContent, newContent)).toBe(false);
    });

    it('returns false when version field is missing in old content', () => {
      const oldContent = JSON.stringify({
        name: 'test-package',
        description: 'Test package'
      });
      const newContent = JSON.stringify({
        name: 'test-package',
        version: '1.0.1',
        description: 'Test package'
      });

      expect(isPackageJsonVersionOnlyChange(oldContent, newContent)).toBe(false);
    });

    it('returns false when version field is missing in new content', () => {
      const oldContent = JSON.stringify({
        name: 'test-package',
        version: '1.0.0',
        description: 'Test package'
      });
      const newContent = JSON.stringify({
        name: 'test-package',
        description: 'Test package'
      });

      expect(isPackageJsonVersionOnlyChange(oldContent, newContent)).toBe(false);
    });

    it('returns false when JSON is invalid', () => {
      const oldContent = 'invalid json';
      const newContent = '{ "name": "test" }';

      expect(isPackageJsonVersionOnlyChange(oldContent, newContent)).toBe(false);
    });

    it('returns true even with whitespace differences', () => {
      const oldContent = JSON.stringify(
        {
          name: 'test-package',
          version: '1.0.0',
          description: 'Test package'
        },
        null,
        2
      );
      const newContent = JSON.stringify({
        name: 'test-package',
        version: '1.0.1',
        description: 'Test package'
      });

      expect(isPackageJsonVersionOnlyChange(oldContent, newContent)).toBe(true);
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

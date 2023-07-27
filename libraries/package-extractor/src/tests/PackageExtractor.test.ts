import path from 'path';

import { FileSystem, Terminal, StringBufferTerminalProvider } from '@rushstack/node-core-library';
import { loadRushProjectFromConfigurationFile } from './Utils';
import {
  PackageExtractor,
  type IExtractorProjectConfiguration,
  type IExtractorDependencyConfiguration
} from '../PackageExtractor';

describe(PackageExtractor.name, () => {
  // because this files will be compiled to js, and the path will change if using __dirname
  // using path inside src folder
  const testRepoRoot = path.join(path.resolve(__dirname, '../../'), 'src/tests/package-extractor-test-repo');
  const testRepoTargetFolder = path.join(testRepoRoot, 'output');
  const projects = loadRushProjectFromConfigurationFile(path.resolve(testRepoRoot, 'rush.json'));
  const terminal = new Terminal(new StringBufferTerminalProvider());
  const packageExtractor = new PackageExtractor();
  const projectConfigurations: IExtractorProjectConfiguration[] = projects.map((p) => ({
    projectFolder: p.projectFolder,
    projectName: p.packageName
  }));
  beforeAll(() => {
    FileSystem.ensureEmptyFolder(testRepoTargetFolder);
  });
  afterEach(() => {
    // clean up target folder after each test run
    FileSystem.ensureEmptyFolder(testRepoTargetFolder);
  });

  it('should extract project correctly', async () => {
    await expect(
      packageExtractor.extractAsync({
        mainProjectName: 'foo',
        sourceRootFolder: testRepoRoot,
        targetRootFolder: testRepoTargetFolder,
        overwriteExisting: true,
        projectConfigurations,
        terminal,
        createArchiveOnly: false,
        includeNpmIgnoreFiles: true
      })
    ).resolves.not.toThrow();
    expect(FileSystem.exists(path.resolve(testRepoTargetFolder, 'packages/foo/dist/index.js'))).toBe(true);
    expect(FileSystem.exists(path.resolve(testRepoTargetFolder, 'packages/foo/src/index.ts'))).toBe(true);
    expect(FileSystem.exists(path.resolve(testRepoTargetFolder, 'packages/foo/node_modules/'))).toBe(true);
  });

  it('should throw error if main project was not correct', async () => {
    await expect(
      packageExtractor.extractAsync({
        mainProjectName: 'project-that-not-exist',
        sourceRootFolder: 'dist',
        targetRootFolder: testRepoTargetFolder,
        overwriteExisting: true,
        terminal,
        projectConfigurations: []
      })
    ).rejects.toThrowError('Main project "project-that-not-exist" was not found in the list of projects');
  });

  it('should throw error if contains symlink outsides targetRootFolder', async () => {
    // create a symbolic link for testing, link to this unit test file
    const newLinkPath = path.resolve(testRepoRoot, 'packages/foo/src/link.ts');

    if (FileSystem.exists(newLinkPath)) {
      FileSystem.deleteFile(newLinkPath);
    }
    FileSystem.createSymbolicLinkFile({
      newLinkPath,
      linkTargetPath: path.resolve(testRepoRoot, '../PackageExtractor.test.ts')
    });
    await expect(
      packageExtractor
        .extractAsync({
          mainProjectName: 'foo',
          sourceRootFolder: testRepoRoot,
          targetRootFolder: testRepoTargetFolder,
          overwriteExisting: true,
          projectConfigurations,
          terminal,
          createArchiveOnly: false,
          includeNpmIgnoreFiles: true
        })
        .finally(() => {
          // remove symlink to keep state clean
          FileSystem.deleteFile(newLinkPath);
        })
    ).rejects.toThrowError(/^Symlink targets not under folder/);
  });

  it('should exclude file inside local project correctly', async () => {
    const _projectConfigurations: IExtractorProjectConfiguration[] = [];
    projectConfigurations.forEach((p) =>
      _projectConfigurations.push({
        ...p,
        patternsToExclude: p.projectName === 'foo' ? ['src/**'] : undefined
      })
    );
    await expect(
      packageExtractor.extractAsync({
        mainProjectName: 'foo',
        sourceRootFolder: testRepoRoot,
        targetRootFolder: testRepoTargetFolder,
        overwriteExisting: true,
        projectConfigurations: _projectConfigurations,
        terminal,
        createArchiveOnly: false,
        includeNpmIgnoreFiles: true
      })
    ).resolves.not.toThrow();
    expect(FileSystem.exists(path.resolve(testRepoTargetFolder, 'packages/foo/src/index.ts'))).toBe(false);
  });

  it('should exclude file inside third party dependencies', async () => {
    const dependenciesConfigurations: IExtractorDependencyConfiguration[] = [
      {
        dependencyName: 'baz',
        dependencyVersion: '1.0.0',
        patternsToExclude: ['folder-that-should-be-exclude/**']
      }
    ];
    await expect(
      packageExtractor.extractAsync({
        mainProjectName: 'foo',
        sourceRootFolder: testRepoRoot,
        targetRootFolder: testRepoTargetFolder,
        overwriteExisting: true,
        projectConfigurations,
        terminal,
        createArchiveOnly: false,
        includeNpmIgnoreFiles: true,
        dependenciesConfigurations
      })
    ).resolves.not.toThrow();
    expect(
      FileSystem.exists(
        path.resolve(
          testRepoTargetFolder,
          'packages/foo/node_modules/.pnpm/baz/folder-that-should-be-exclude/file-should-be-exclude.ts'
        )
      )
    ).toBe(false);
  });
});

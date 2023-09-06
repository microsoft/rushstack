// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'path';

import { FileSystem, Terminal, StringBufferTerminalProvider } from '@rushstack/node-core-library';
import { PackageExtractor, type IExtractorProjectConfiguration } from '../PackageExtractor';

// Do this work in the "temp/test.jest" directory since it gets cleaned on clean runs
const extractorTargetFolder: string = path.resolve(__dirname, '..', '..', 'test-output');
const repoRoot: string = path.resolve(__dirname, '..', '..', '..', '..');
const project1PackageName: string = 'package-extractor-test-01';
const project2PackageName: string = 'package-extractor-test-02';
const project3PackageName: string = 'package-extractor-test-03';
const project4PackageName: string = 'package-extractor-test-04';
const project1RelativePath: string = path.join('build-tests', project1PackageName);
const project2RelativePath: string = path.join('build-tests', project2PackageName);
const project3RelativePath: string = path.join('build-tests', project3PackageName);
const project4RelativePath: string = path.join('build-tests', project4PackageName);
const project1Path: string = path.join(repoRoot, project1RelativePath);
const project2Path: string = path.resolve(repoRoot, project2RelativePath);
const project3Path: string = path.resolve(repoRoot, project3RelativePath);
const project4Path: string = path.resolve(repoRoot, project4RelativePath);

function getDefaultProjectConfigurations(): IExtractorProjectConfiguration[] {
  return [
    {
      projectName: project1PackageName,
      projectFolder: project1Path
    },
    {
      projectName: project2PackageName,
      projectFolder: project2Path
    },
    {
      projectName: project3PackageName,
      projectFolder: project3Path
    }
  ];
}

describe(PackageExtractor.name, () => {
  const terminal = new Terminal(new StringBufferTerminalProvider());
  const packageExtractor = new PackageExtractor();

  it('should extract project', async () => {
    const targetFolder: string = path.join(extractorTargetFolder, 'extractor-output-01');

    await expect(
      packageExtractor.extractAsync({
        mainProjectName: project1PackageName,
        sourceRootFolder: repoRoot,
        targetRootFolder: targetFolder,
        overwriteExisting: true,
        projectConfigurations: getDefaultProjectConfigurations(),
        terminal,
        createArchiveOnly: false,
        includeNpmIgnoreFiles: true,
        linkCreation: 'default',
        includeDevDependencies: true
      })
    ).resolves.not.toThrow();

    // Validate project 1 files
    expect(FileSystem.exists(path.join(targetFolder, project1RelativePath, 'src', 'index.js'))).toBe(true);

    // Validate project 2 is linked through node_modules
    const project1NodeModulesPath: string = path.join(targetFolder, project1RelativePath, 'node_modules');
    expect(
      FileSystem.getRealPath(path.join(project1NodeModulesPath, project2PackageName, 'src', 'index.js'))
    ).toEqual(path.join(targetFolder, project2RelativePath, 'src', 'index.js'));

    // Validate project 3 is linked through node_modules
    expect(
      FileSystem.getRealPath(path.join(project1NodeModulesPath, project3PackageName, 'src', 'index.js'))
    ).toEqual(path.join(targetFolder, project3RelativePath, 'src', 'index.js'));
    expect(
      FileSystem.getRealPath(
        path.join(
          project1NodeModulesPath,
          project2PackageName,
          'node_modules',
          project3PackageName,
          'src',
          'index.js'
        )
      )
    ).toEqual(path.join(targetFolder, project3RelativePath, 'src', 'index.js'));
  });

  it('should extract project with dependencies only', async () => {
    const targetFolder: string = path.join(extractorTargetFolder, 'extractor-output-02');

    await expect(
      packageExtractor.extractAsync({
        mainProjectName: project1PackageName,
        sourceRootFolder: repoRoot,
        targetRootFolder: targetFolder,
        overwriteExisting: true,
        projectConfigurations: getDefaultProjectConfigurations(),
        terminal,
        createArchiveOnly: false,
        includeNpmIgnoreFiles: true,
        linkCreation: 'default',
        includeDevDependencies: false
      })
    ).resolves.not.toThrow();

    // Validate project 1 files
    expect(FileSystem.exists(path.join(targetFolder, project1RelativePath, 'src', 'index.js'))).toBe(true);

    // Validate project 2 is linked through node_modules
    const project1NodeModulesPath: string = path.join(targetFolder, project1RelativePath, 'node_modules');
    expect(
      FileSystem.getRealPath(path.join(project1NodeModulesPath, project2PackageName, 'src', 'index.js'))
    ).toEqual(path.join(targetFolder, project2RelativePath, 'src', 'index.js'));

    // Validate project 3 is not linked through node_modules on project 1 but is linked through node_modules on project 2
    expect(FileSystem.exists(path.join(project1NodeModulesPath, project3PackageName))).toBe(false);
    expect(
      FileSystem.getRealPath(
        path.join(
          project1NodeModulesPath,
          project2PackageName,
          'node_modules',
          project3PackageName,
          'src',
          'index.js'
        )
      )
    ).toEqual(path.join(targetFolder, project3RelativePath, 'src', 'index.js'));
  });

  it('should throw error if main project does not exist', async () => {
    const targetFolder: string = path.join(extractorTargetFolder, 'extractor-output-03');

    await expect(
      packageExtractor.extractAsync({
        mainProjectName: 'project-that-not-exist',
        sourceRootFolder: repoRoot,
        targetRootFolder: targetFolder,
        overwriteExisting: true,
        terminal,
        projectConfigurations: [],
        linkCreation: 'default'
      })
    ).rejects.toThrowError('Main project "project-that-not-exist" was not found in the list of projects');
  });

  it('should throw error if contains symlink outsides targetRootFolder', async () => {
    const sourceFolder: string = path.join(repoRoot, 'build-tests');
    const targetFolder: string = path.join(extractorTargetFolder, 'extractor-output-04');

    await expect(
      packageExtractor.extractAsync({
        mainProjectName: project4PackageName,
        sourceRootFolder: sourceFolder,
        targetRootFolder: targetFolder,
        overwriteExisting: true,
        projectConfigurations: [
          {
            projectName: project4PackageName,
            projectFolder: project4Path
          }
        ],
        terminal,
        createArchiveOnly: false,
        includeNpmIgnoreFiles: true
      })
    ).rejects.toThrowError(/Symlink targets not under folder/);
  });

  it('should exclude specified dependencies', async () => {
    const targetFolder: string = path.join(extractorTargetFolder, 'extractor-output-05');

    await expect(
      packageExtractor.extractAsync({
        mainProjectName: project1PackageName,
        sourceRootFolder: repoRoot,
        targetRootFolder: targetFolder,
        overwriteExisting: true,
        projectConfigurations: [
          {
            projectName: project1PackageName,
            projectFolder: project1Path,
            patternsToExclude: ['src/**']
          },
          {
            projectName: project2PackageName,
            projectFolder: project2Path
          },
          {
            projectName: project3PackageName,
            projectFolder: project3Path
          }
        ],
        terminal,
        createArchiveOnly: false,
        includeNpmIgnoreFiles: true,
        linkCreation: 'default',
        includeDevDependencies: true
      })
    ).resolves.not.toThrow();

    // Validate project 1 files
    expect(FileSystem.exists(path.join(targetFolder, project1RelativePath, 'package.json'))).toBe(true);
    expect(FileSystem.exists(path.join(targetFolder, project1RelativePath, 'src', 'index.js'))).toBe(false);
    expect(FileSystem.exists(path.join(targetFolder, project1RelativePath, 'src', 'subdir'))).toBe(false);

    // Validate project 2 files
    expect(FileSystem.exists(path.join(targetFolder, project2RelativePath, 'package.json'))).toBe(true);
    expect(FileSystem.exists(path.join(targetFolder, project2RelativePath, 'src', 'index.js'))).toBe(true);
  });

  it('should include specified dependencies', async () => {
    const targetFolder: string = path.join(extractorTargetFolder, 'extractor-output-05');

    await expect(
      packageExtractor.extractAsync({
        mainProjectName: project1PackageName,
        sourceRootFolder: repoRoot,
        targetRootFolder: targetFolder,
        overwriteExisting: true,
        projectConfigurations: [
          {
            projectName: project1PackageName,
            projectFolder: project1Path,
            patternsToInclude: ['src/subdir/**']
          }
        ],
        terminal,
        createArchiveOnly: false,
        includeNpmIgnoreFiles: true,
        linkCreation: 'default',
        includeDevDependencies: true
      })
    ).resolves.not.toThrow();

    // Validate project 1 files
    expect(FileSystem.exists(path.join(targetFolder, project1RelativePath, 'package.json'))).toBe(false);
    expect(FileSystem.exists(path.join(targetFolder, project1RelativePath, 'src'))).toBe(true);
    expect(FileSystem.exists(path.join(targetFolder, project1RelativePath, 'src', 'index.js'))).toBe(false);
    expect(FileSystem.exists(path.join(targetFolder, project1RelativePath, 'src', 'subdir'))).toBe(true);
    expect(FileSystem.exists(path.join(targetFolder, project1RelativePath, 'src', 'subdir', 'file.js'))).toBe(
      true
    );
  });

  it('should exclude specified dependencies on local dependencies', async () => {
    const targetFolder: string = path.join(extractorTargetFolder, 'extractor-output-06');

    await expect(
      packageExtractor.extractAsync({
        mainProjectName: project1PackageName,
        sourceRootFolder: repoRoot,
        targetRootFolder: targetFolder,
        overwriteExisting: true,
        projectConfigurations: [
          {
            projectName: project1PackageName,
            projectFolder: project1Path
          },
          {
            projectName: project2PackageName,
            projectFolder: project2Path,
            patternsToExclude: ['src/**']
          },
          {
            projectName: project3PackageName,
            projectFolder: project3Path
          }
        ],
        terminal,
        createArchiveOnly: false,
        includeNpmIgnoreFiles: true,
        linkCreation: 'default',
        includeDevDependencies: true
      })
    ).resolves.not.toThrow();

    // Validate project 1 files
    expect(FileSystem.exists(path.join(targetFolder, project1RelativePath, 'package.json'))).toBe(true);
    expect(FileSystem.exists(path.join(targetFolder, project1RelativePath, 'src', 'index.js'))).toBe(true);

    // Validate project 2 files
    expect(FileSystem.exists(path.join(targetFolder, project2RelativePath, 'package.json'))).toBe(true);
    expect(FileSystem.exists(path.join(targetFolder, project2RelativePath, 'src', 'index.js'))).toBe(false);
  });

  it('should exclude specified files on third party dependencies with semver version', async () => {
    const targetFolder: string = path.join(extractorTargetFolder, 'extractor-output-07');

    await expect(
      packageExtractor.extractAsync({
        mainProjectName: project1PackageName,
        sourceRootFolder: repoRoot,
        targetRootFolder: targetFolder,
        overwriteExisting: true,
        projectConfigurations: [
          {
            projectName: project1PackageName,
            projectFolder: project1Path
          },
          {
            projectName: project2PackageName,
            projectFolder: project2Path
          },
          {
            projectName: project3PackageName,
            projectFolder: project3Path
          }
        ],
        dependencyConfigurations: [
          {
            dependencyName: '@types/node',
            dependencyVersionRange: '^14.18.36',
            patternsToExclude: ['fs/**']
          }
        ],
        terminal,
        createArchiveOnly: false,
        includeNpmIgnoreFiles: true,
        linkCreation: 'default',
        includeDevDependencies: true
      })
    ).resolves.not.toThrow();
    // Validate project 1 files
    expect(
      FileSystem.exists(
        path.join(targetFolder, project1RelativePath, 'node_modules/@types/node/fs/promises.d.ts')
      )
    ).toBe(false);
    expect(
      FileSystem.exists(path.join(targetFolder, project1RelativePath, 'node_modules/@types/node/path.d.ts'))
    ).toBe(true);

    // Validate project 3 files
    expect(
      FileSystem.exists(
        path.join(targetFolder, project3RelativePath, 'node_modules/@types/node/fs/promises.d.ts')
      )
    ).toBe(true);
  });
  it('should not exclude specified files on third party dependencies if semver version not match', async () => {
    const targetFolder: string = path.join(extractorTargetFolder, 'extractor-output-08');

    await expect(
      packageExtractor.extractAsync({
        mainProjectName: project1PackageName,
        sourceRootFolder: repoRoot,
        targetRootFolder: targetFolder,
        overwriteExisting: true,
        projectConfigurations: [
          {
            projectName: project1PackageName,
            projectFolder: project1Path
          },
          {
            projectName: project2PackageName,
            projectFolder: project2Path
          },
          {
            projectName: project3PackageName,
            projectFolder: project3Path
          }
        ],
        dependencyConfigurations: [
          {
            dependencyName: '@types/node',
            dependencyVersionRange: '^16.20.0',
            patternsToExclude: ['fs/**']
          }
        ],
        terminal,
        createArchiveOnly: false,
        includeNpmIgnoreFiles: true,
        linkCreation: 'default',
        includeDevDependencies: true
      })
    ).resolves.not.toThrow();
    // Validate project 1 files
    expect(
      FileSystem.exists(
        path.join(targetFolder, project1RelativePath, 'node_modules/@types/node/fs/promises.d.ts')
      )
    ).toBe(true);

    // Validate project file that shouldn't be exclude
    expect(
      FileSystem.exists(
        path.join(targetFolder, project3RelativePath, 'node_modules/@types/node/fs/promises.d.ts')
      )
    ).toBe(true);
  });
});

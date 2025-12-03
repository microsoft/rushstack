// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';
import type { ChildProcess } from 'node:child_process';

import { Executable, FileSystem, Sort } from '@rushstack/node-core-library';
import { Terminal, StringBufferTerminalProvider } from '@rushstack/terminal';
import {
  PackageExtractor,
  type IExtractorProjectConfiguration,
  type IExtractorMetadataJson
} from '../PackageExtractor';

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
    await expect(
      FileSystem.existsAsync(path.join(targetFolder, project1RelativePath, 'src', 'index.js'))
    ).resolves.toBe(true);

    // Validate project 2 is linked through node_modules
    const project1NodeModulesPath: string = path.join(targetFolder, project1RelativePath, 'node_modules');
    await expect(
      FileSystem.getRealPathAsync(path.join(project1NodeModulesPath, project2PackageName, 'src', 'index.js'))
    ).resolves.toEqual(path.join(targetFolder, project2RelativePath, 'src', 'index.js'));

    // Validate project 3 is linked through node_modules
    await expect(
      FileSystem.getRealPathAsync(path.join(project1NodeModulesPath, project3PackageName, 'src', 'index.js'))
    ).resolves.toEqual(path.join(targetFolder, project3RelativePath, 'src', 'index.js'));
    await expect(
      FileSystem.getRealPathAsync(
        path.join(
          project1NodeModulesPath,
          project2PackageName,
          'node_modules',
          project3PackageName,
          'src',
          'index.js'
        )
      )
    ).resolves.toEqual(path.join(targetFolder, project3RelativePath, 'src', 'index.js'));
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
    await expect(
      FileSystem.existsAsync(path.join(targetFolder, project1RelativePath, 'src', 'index.js'))
    ).resolves.toBe(true);

    // Validate project 2 is linked through node_modules
    const project1NodeModulesPath: string = path.join(targetFolder, project1RelativePath, 'node_modules');
    await expect(
      FileSystem.getRealPathAsync(path.join(project1NodeModulesPath, project2PackageName, 'src', 'index.js'))
    ).resolves.toEqual(path.join(targetFolder, project2RelativePath, 'src', 'index.js'));

    // Validate project 3 is not linked through node_modules on project 1 but is linked through node_modules on project 2
    await expect(
      FileSystem.existsAsync(path.join(project1NodeModulesPath, project3PackageName))
    ).resolves.toBe(false);
    await expect(
      FileSystem.getRealPathAsync(
        path.join(
          project1NodeModulesPath,
          project2PackageName,
          'node_modules',
          project3PackageName,
          'src',
          'index.js'
        )
      )
    ).resolves.toEqual(path.join(targetFolder, project3RelativePath, 'src', 'index.js'));
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
    await expect(
      FileSystem.existsAsync(path.join(targetFolder, project1RelativePath, 'package.json'))
    ).resolves.toBe(true);
    await expect(
      FileSystem.existsAsync(path.join(targetFolder, project1RelativePath, 'src', 'index.js'))
    ).resolves.toBe(false);
    await expect(
      FileSystem.existsAsync(path.join(targetFolder, project1RelativePath, 'src', 'subdir'))
    ).resolves.toBe(false);

    // Validate project 2 files
    await expect(
      FileSystem.existsAsync(path.join(targetFolder, project2RelativePath, 'package.json'))
    ).resolves.toBe(true);
    await expect(
      FileSystem.existsAsync(path.join(targetFolder, project2RelativePath, 'src', 'index.js'))
    ).resolves.toBe(true);
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
    await expect(
      FileSystem.existsAsync(path.join(targetFolder, project1RelativePath, 'package.json'))
    ).resolves.toBe(false);
    await expect(FileSystem.existsAsync(path.join(targetFolder, project1RelativePath, 'src'))).resolves.toBe(
      true
    );
    await expect(
      FileSystem.existsAsync(path.join(targetFolder, project1RelativePath, 'src', 'index.js'))
    ).resolves.toBe(false);
    await expect(
      FileSystem.existsAsync(path.join(targetFolder, project1RelativePath, 'src', 'subdir'))
    ).resolves.toBe(true);
    await expect(
      FileSystem.existsAsync(path.join(targetFolder, project1RelativePath, 'src', 'subdir', 'file.js'))
    ).resolves.toBe(true);
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
    await expect(
      FileSystem.existsAsync(path.join(targetFolder, project1RelativePath, 'package.json'))
    ).resolves.toBe(true);
    await expect(
      FileSystem.existsAsync(path.join(targetFolder, project1RelativePath, 'src', 'index.js'))
    ).resolves.toBe(true);

    // Validate project 2 files
    await expect(
      FileSystem.existsAsync(path.join(targetFolder, project2RelativePath, 'package.json'))
    ).resolves.toBe(true);
    await expect(
      FileSystem.existsAsync(path.join(targetFolder, project2RelativePath, 'src', 'index.js'))
    ).resolves.toBe(false);
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
            dependencyVersionRange: '^18',
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
    await expect(
      FileSystem.existsAsync(
        path.join(targetFolder, project1RelativePath, 'node_modules/@types/node/fs-promises.d.ts')
      )
    ).resolves.toBe(false);
    await expect(
      FileSystem.existsAsync(
        path.join(targetFolder, project1RelativePath, 'node_modules/@types/node/path.d.ts')
      )
    ).resolves.toBe(true);

    // Validate project 3 files
    await expect(
      FileSystem.existsAsync(
        path.join(targetFolder, project3RelativePath, 'node_modules/@types/node/fs/promises.d.ts')
      )
    ).resolves.toBe(true);
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
    await expect(
      FileSystem.existsAsync(
        path.join(targetFolder, project1RelativePath, 'node_modules/@types/node/fs/promises.d.ts')
      )
    ).resolves.toBe(true);

    // Validate project file that shouldn't be exclude
    await expect(
      FileSystem.existsAsync(
        path.join(targetFolder, project3RelativePath, 'node_modules/@types/node/fs/promises.d.ts')
      )
    ).resolves.toBe(true);
  });

  it('should include folderToCopy', async () => {
    const targetFolder: string = path.join(extractorTargetFolder, 'extractor-output-09');

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
          }
        ],
        folderToCopy: project2Path,
        terminal,
        createArchiveOnly: false,
        includeNpmIgnoreFiles: true,
        linkCreation: 'default',
        includeDevDependencies: true
      })
    ).resolves.not.toThrow();

    // Validate project 1 files
    await expect(
      FileSystem.existsAsync(path.join(targetFolder, project1RelativePath, 'package.json'))
    ).resolves.toBe(true);
    await expect(
      FileSystem.existsAsync(path.join(targetFolder, project1RelativePath, 'src', 'index.js'))
    ).resolves.toBe(true);

    // Validate project 2 files
    await expect(FileSystem.existsAsync(path.join(targetFolder, 'package.json'))).resolves.toBe(true);
    await expect(FileSystem.existsAsync(path.join(targetFolder, 'src', 'index.js'))).resolves.toBe(true);
  });

  it('should extract project with script linkCreation', async () => {
    const targetFolder: string = path.join(extractorTargetFolder, 'extractor-output-10');

    await expect(
      packageExtractor.extractAsync({
        mainProjectName: project1PackageName,
        sourceRootFolder: repoRoot,
        targetRootFolder: targetFolder,
        overwriteExisting: true,
        projectConfigurations: getDefaultProjectConfigurations(),
        terminal,
        includeNpmIgnoreFiles: true,
        linkCreation: 'script',
        includeDevDependencies: true
      })
    ).resolves.not.toThrow();

    // Validate project 1 files
    await expect(
      FileSystem.existsAsync(path.join(targetFolder, project1RelativePath, 'src', 'index.js'))
    ).resolves.toBe(true);

    // Validate project 2 is not linked through node_modules
    const project1NodeModulesPath: string = path.join(targetFolder, project1RelativePath, 'node_modules');
    await expect(
      FileSystem.existsAsync(path.join(project1NodeModulesPath, project2PackageName, 'src', 'index.js'))
    ).resolves.toEqual(false);

    // Validate project 3 is not linked through node_modules
    await expect(
      FileSystem.existsAsync(path.join(project1NodeModulesPath, project3PackageName, 'src', 'index.js'))
    ).resolves.toEqual(false);

    // Run the linkCreation script
    const createLinksProcess: ChildProcess = Executable.spawn(process.argv0, [
      path.join(targetFolder, 'create-links.js'),
      'create'
    ]);
    await expect(
      Executable.waitForExitAsync(createLinksProcess, { throwOnNonZeroExitCode: true })
    ).resolves.not.toThrow();

    // Validate project 2 is linked through node_modules
    await expect(
      FileSystem.getRealPathAsync(path.join(project1NodeModulesPath, project2PackageName, 'src', 'index.js'))
    ).resolves.toEqual(path.join(targetFolder, project2RelativePath, 'src', 'index.js'));

    // Validate project 3 is linked through node_modules
    await expect(
      FileSystem.getRealPathAsync(path.join(project1NodeModulesPath, project3PackageName, 'src', 'index.js'))
    ).resolves.toEqual(path.join(targetFolder, project3RelativePath, 'src', 'index.js'));
    await expect(
      FileSystem.getRealPathAsync(
        path.join(
          project1NodeModulesPath,
          project2PackageName,
          'node_modules',
          project3PackageName,
          'src',
          'index.js'
        )
      )
    ).resolves.toEqual(path.join(targetFolder, project3RelativePath, 'src', 'index.js'));

    const metadataFileContent: string = await FileSystem.readFileAsync(
      `${targetFolder}/extractor-metadata.json`
    );
    const metadata: IExtractorMetadataJson = JSON.parse(metadataFileContent);
    Sort.sortBy(metadata.files, (x) => x);
    Sort.sortBy(metadata.links, (x) => x.linkPath);
    Sort.sortBy(metadata.projects, (x) => x.path);
    expect(metadata).toMatchSnapshot();
  });

  it('should extract project with script linkCreation and custom linkCreationScriptPath', async () => {
    const targetFolder: string = path.join(extractorTargetFolder, 'extractor-output-11');
    const linkCreationScriptPath: string = path.join(targetFolder, 'foo', 'bar', 'baz.js');

    await expect(
      packageExtractor.extractAsync({
        mainProjectName: project1PackageName,
        sourceRootFolder: repoRoot,
        targetRootFolder: targetFolder,
        overwriteExisting: true,
        projectConfigurations: getDefaultProjectConfigurations(),
        terminal,
        includeNpmIgnoreFiles: true,
        linkCreation: 'script',
        linkCreationScriptPath,
        includeDevDependencies: true
      })
    ).resolves.not.toThrow();

    // Validate project 1 files
    await expect(
      FileSystem.existsAsync(path.join(targetFolder, project1RelativePath, 'src', 'index.js'))
    ).resolves.toBe(true);

    // Validate project 2 is not linked through node_modules
    const project1NodeModulesPath: string = path.join(targetFolder, project1RelativePath, 'node_modules');
    await expect(
      FileSystem.existsAsync(path.join(project1NodeModulesPath, project2PackageName, 'src', 'index.js'))
    ).resolves.toEqual(false);

    // Validate project 3 is not linked through node_modules
    await expect(
      FileSystem.existsAsync(path.join(project1NodeModulesPath, project3PackageName, 'src', 'index.js'))
    ).resolves.toEqual(false);

    // Run the linkCreation script
    const createLinksProcess: ChildProcess = Executable.spawn(process.argv0, [
      linkCreationScriptPath,
      'create'
    ]);
    await expect(
      Executable.waitForExitAsync(createLinksProcess, { throwOnNonZeroExitCode: true })
    ).resolves.not.toThrow();

    // Validate project 2 is linked through node_modules
    await expect(
      FileSystem.getRealPathAsync(path.join(project1NodeModulesPath, project2PackageName, 'src', 'index.js'))
    ).resolves.toEqual(path.join(targetFolder, project2RelativePath, 'src', 'index.js'));

    // Validate project 3 is linked through node_modules
    await expect(
      FileSystem.getRealPathAsync(path.join(project1NodeModulesPath, project3PackageName, 'src', 'index.js'))
    ).resolves.toEqual(path.join(targetFolder, project3RelativePath, 'src', 'index.js'));
    await expect(
      FileSystem.getRealPathAsync(
        path.join(
          project1NodeModulesPath,
          project2PackageName,
          'node_modules',
          project3PackageName,
          'src',
          'index.js'
        )
      )
    ).resolves.toEqual(path.join(targetFolder, project3RelativePath, 'src', 'index.js'));

    const metadataFileContent: string = await FileSystem.readFileAsync(
      `${path.dirname(linkCreationScriptPath)}/extractor-metadata.json`
    );
    const metadata: IExtractorMetadataJson = JSON.parse(metadataFileContent);
    Sort.sortBy(metadata.files, (x) => x);
    Sort.sortBy(metadata.links, (x) => x.linkPath);
    Sort.sortBy(metadata.projects, (x) => x.path);
    expect(metadata).toMatchSnapshot();
  });
});

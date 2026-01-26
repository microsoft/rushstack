// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import type * as child_process from 'node:child_process';

import { FileSystem, Executable, JsonFile, type JsonObject } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';

/**
 * Helper class for running integration tests with Rush package managers
 */
export class TestHelper {
  public readonly rushstackRoot: string;
  private readonly _rushBinPath: string;
  private readonly _terminal: ITerminal;

  public constructor(terminal: ITerminal) {
    this._terminal = terminal;
    // Resolve rushstack root and rush bin path
    this.rushstackRoot = path.resolve(__dirname, '../../..');
    // Use the locally built rush from apps/rush
    this._rushBinPath = path.join(this.rushstackRoot, 'apps/rush/lib/start.js');
  }

  /**
   * Execute a Rush command using the locally-built Rush
   */
  public async executeRushAsync(args: string[], workingDirectory: string): Promise<void> {
    this._terminal.writeLine(`Executing: ${process.argv0} ${this._rushBinPath} ${args.join(' ')}`);

    const childProcess: child_process.ChildProcess = Executable.spawn(
      process.argv0,
      [this._rushBinPath, ...args],
      {
        currentWorkingDirectory: workingDirectory,
        stdio: 'inherit'
      }
    );

    await Executable.waitForExitAsync(childProcess, {
      throwOnNonZeroExitCode: true
    });
  }

  /**
   * Create a test Rush repository with the specified package manager
   */
  public async createTestRepoAsync(
    testRepoPath: string,
    packageManagerType: 'npm' | 'yarn',
    packageManagerVersion: string
  ): Promise<void> {
    // Clean up previous test run
    if (await FileSystem.existsAsync(testRepoPath)) {
      this._terminal.writeLine('Cleaning up previous test run...');
      await FileSystem.deleteFolderAsync(testRepoPath);
    }

    // Create test repo directory
    this._terminal.writeLine(`Creating test repository at ${testRepoPath}...`);
    await FileSystem.ensureFolderAsync(testRepoPath);

    // Initialize Rush repo
    this._terminal.writeLine('Initializing Rush repo...');
    await this.executeRushAsync(['init'], testRepoPath);

    // Configure rush.json for the specified package manager
    this._terminal.writeLine(`Configuring rush.json for ${packageManagerType} mode...`);
    const rushJsonPath: string = path.join(testRepoPath, 'rush.json');
    const rushJson: JsonObject = await JsonFile.loadAsync(rushJsonPath);

    // Update package manager configuration
    if (packageManagerType === 'npm') {
      delete rushJson.pnpmVersion;
      delete rushJson.yarnVersion;
      rushJson.npmVersion = packageManagerVersion;
    } else if (packageManagerType === 'yarn') {
      delete rushJson.pnpmVersion;
      delete rushJson.npmVersion;
      rushJson.yarnVersion = packageManagerVersion;
    }

    // Add test projects
    rushJson.projects = [
      {
        packageName: 'test-project-a',
        projectFolder: 'projects/test-project-a'
      },
      {
        packageName: 'test-project-b',
        projectFolder: 'projects/test-project-b'
      }
    ];

    // Update nodeSupportedVersionRange to match current environment
    rushJson.nodeSupportedVersionRange = '>=18.0.0';

    await JsonFile.saveAsync(rushJson, rushJsonPath, { updateExistingFile: true });
  }

  /**
   * Create a test project with the specified configuration
   */
  public async createTestProjectAsync(
    testRepoPath: string,
    projectName: string,
    version: string,
    dependencies: Record<string, string>,
    buildScript: string
  ): Promise<void> {
    const projectPath: string = path.join(testRepoPath, 'projects', projectName);
    await FileSystem.ensureFolderAsync(projectPath);

    const packageJson: JsonObject = {
      name: projectName,
      version: version,
      main: 'lib/index.js',
      scripts: {
        build: buildScript
      },
      dependencies: dependencies
    };

    await JsonFile.saveAsync(packageJson, path.join(projectPath, 'package.json'));
  }

  /**
   * Verify that temp project tarballs were created
   */
  public async verifyTempTarballsAsync(testRepoPath: string, projectNames: string[]): Promise<void> {
    this._terminal.writeLine('\nVerifying temp project tarballs were created...');
    for (const projectName of projectNames) {
      const tarballPath: string = path.join(testRepoPath, 'common/temp/projects', `${projectName}.tgz`);
      if (!(await FileSystem.existsAsync(tarballPath))) {
        throw new Error(`ERROR: ${projectName}.tgz was not created!`);
      }
    }
    this._terminal.writeLine('✓ Temp project tarballs created successfully');
  }

  /**
   * Verify that dependencies are installed correctly
   */
  public async verifyDependenciesAsync(
    testRepoPath: string,
    projectName: string,
    expectedDependencies: string[]
  ): Promise<void> {
    this._terminal.writeLine('\nVerifying node_modules structure...');
    const projectNodeModules: string = path.join(testRepoPath, 'projects', projectName, 'node_modules');

    for (const dep of expectedDependencies) {
      const depPath: string = path.join(projectNodeModules, dep);
      if (!(await FileSystem.existsAsync(depPath))) {
        throw new Error(`ERROR: ${dep} not found in ${projectName}!`);
      }
    }
    this._terminal.writeLine('✓ Dependencies installed correctly');
  }

  /**
   * Verify that build outputs were created
   */
  public async verifyBuildOutputsAsync(testRepoPath: string, projectNames: string[]): Promise<void> {
    this._terminal.writeLine('\nVerifying build outputs...');
    for (const projectName of projectNames) {
      const outputPath: string = path.join(testRepoPath, 'projects', projectName, 'lib/index.js');
      if (!(await FileSystem.existsAsync(outputPath))) {
        throw new Error(`ERROR: ${projectName} build output not found!`);
      }
    }
    this._terminal.writeLine('✓ Build completed successfully');
  }

  /**
   * Test that the built code executes correctly
   */
  public async testBuiltCodeAsync(testRepoPath: string, projectName: string): Promise<void> {
    this._terminal.writeLine('\nTesting built code...');
    const projectLib: string = path.join(testRepoPath, 'projects', projectName, 'lib/index.js');

    // Use Executable.spawnSync to capture output
    const result: string = Executable.spawnSync(
      process.argv0,
      ['-e', `const b = require('${projectLib}'); console.log(b.test());`],
      {
        currentWorkingDirectory: testRepoPath
      }
    ).stdout.toString();

    if (!result.includes('Using: Hello from A')) {
      throw new Error('ERROR: Built code did not execute as expected!');
    }
    this._terminal.writeLine('✓ Built code executes correctly');
  }
}

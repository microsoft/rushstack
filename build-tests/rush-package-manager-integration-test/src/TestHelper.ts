// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import type * as child_process from 'node:child_process';

import { FileSystem, Executable } from '@rushstack/node-core-library';

/**
 * Helper class for running integration tests with Rush package managers
 */
export class TestHelper {
  private readonly _rushstackRoot: string;
  private readonly _rushBinPath: string;

  public constructor() {
    // Get rushstack root (two levels up from build-tests/rush-package-manager-integration-test)
    this._rushstackRoot = path.resolve(__dirname, '../../..');
    this._rushBinPath = path.join(this._rushstackRoot, 'apps/rush/lib/start.js');
  }

  public get rushstackRoot(): string {
    return this._rushstackRoot;
  }

  /**
   * Execute a Rush command using the locally-built Rush
   */
  public async executeRushAsync(args: string[], workingDirectory: string): Promise<void> {
    console.log(`Executing: node ${this._rushBinPath} ${args.join(' ')}`);

    const childProcess: child_process.ChildProcess = Executable.spawn('node', [this._rushBinPath, ...args], {
      currentWorkingDirectory: workingDirectory,
      stdio: 'inherit'
    });

    const result = await Executable.waitForExitAsync(childProcess);
    if (result.exitCode !== 0) {
      throw new Error(`Command failed with exit code ${result.exitCode}`);
    }
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
    if (FileSystem.exists(testRepoPath)) {
      console.log('Cleaning up previous test run...');
      FileSystem.deleteFolder(testRepoPath);
    }

    // Create test repo directory
    console.log(`Creating test repository at ${testRepoPath}...`);
    FileSystem.ensureFolder(testRepoPath);

    // Initialize Rush repo
    console.log('Initializing Rush repo...');
    await this.executeRushAsync(['init', '--overwrite-existing'], testRepoPath);

    // Configure rush.json for the specified package manager
    console.log(`Configuring rush.json for ${packageManagerType} mode...`);
    const rushJsonPath: string = path.join(testRepoPath, 'rush.json');
    const rushJsonContent: string = FileSystem.readFile(rushJsonPath);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rushJson: any = JSON.parse(rushJsonContent);

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

    FileSystem.writeFile(rushJsonPath, JSON.stringify(rushJson, null, 2));
  }

  /**
   * Create a test project with the specified configuration
   */
  public createTestProject(
    testRepoPath: string,
    projectName: string,
    version: string,
    dependencies: Record<string, string>,
    buildScript: string
  ): void {
    const projectPath: string = path.join(testRepoPath, 'projects', projectName);
    FileSystem.ensureFolder(projectPath);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const packageJson: any = {
      name: projectName,
      version: version,
      main: 'lib/index.js',
      scripts: {
        build: buildScript
      },
      dependencies: dependencies
    };

    FileSystem.writeFile(path.join(projectPath, 'package.json'), JSON.stringify(packageJson, null, 2));
  }

  /**
   * Verify that temp project tarballs were created
   */
  public verifyTempTarballs(testRepoPath: string, projectNames: string[]): void {
    console.log('\nVerifying temp project tarballs were created...');
    for (const projectName of projectNames) {
      const tarballPath: string = path.join(testRepoPath, 'common/temp/projects', `${projectName}.tgz`);
      if (!FileSystem.exists(tarballPath)) {
        throw new Error(`ERROR: ${projectName}.tgz was not created!`);
      }
    }
    console.log('✓ Temp project tarballs created successfully');
  }

  /**
   * Verify that dependencies are installed correctly
   */
  public verifyDependencies(testRepoPath: string, projectName: string, expectedDependencies: string[]): void {
    console.log('\nVerifying node_modules structure...');
    const projectNodeModules: string = path.join(testRepoPath, 'projects', projectName, 'node_modules');

    for (const dep of expectedDependencies) {
      const depPath: string = path.join(projectNodeModules, dep);
      if (!FileSystem.exists(depPath)) {
        throw new Error(`ERROR: ${dep} not found in ${projectName}!`);
      }
    }
    console.log('✓ Dependencies installed correctly');
  }

  /**
   * Verify that build outputs were created
   */
  public verifyBuildOutputs(testRepoPath: string, projectNames: string[]): void {
    console.log('\nVerifying build outputs...');
    for (const projectName of projectNames) {
      const outputPath: string = path.join(testRepoPath, 'projects', projectName, 'lib/index.js');
      if (!FileSystem.exists(outputPath)) {
        throw new Error(`ERROR: ${projectName} build output not found!`);
      }
    }
    console.log('✓ Build completed successfully');
  }

  /**
   * Test that the built code executes correctly
   */
  public async testBuiltCodeAsync(testRepoPath: string, projectName: string): Promise<void> {
    console.log('\nTesting built code...');
    const projectLib: string = path.join(testRepoPath, 'projects', projectName, 'lib/index.js');

    // Use Executable.spawnSync to capture output
    const result: string = Executable.spawnSync(
      'node',
      ['-e', `const b = require('${projectLib}'); console.log(b.test());`],
      {
        currentWorkingDirectory: testRepoPath
      }
    ).stdout.toString();

    if (!result.includes('Using: Hello from A')) {
      throw new Error('ERROR: Built code did not execute as expected!');
    }
    console.log('✓ Built code executes correctly');
  }
}

// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import type { ITerminal } from '@rushstack/terminal';

import { TestHelper } from './TestHelper';

/**
 * Integration test for Rush npm mode with tar 7.x
 * This test verifies that temp project tarballs work correctly with npm package manager
 */
export async function testNpmModeAsync(terminal: ITerminal): Promise<void> {
  const helper: TestHelper = new TestHelper(terminal);
  // Use system temp directory to avoid rush init detecting parent rush.json
  const testRepoPath: string = path.join('/tmp', 'rush-package-manager-test', 'npm-test-repo');

  terminal.writeLine('==========================================');
  terminal.writeLine('Rush NPM Mode Integration Test');
  terminal.writeLine('==========================================');
  terminal.writeLine('');
  terminal.writeLine('This test verifies that tar 7.x changes work correctly with npm package manager');
  terminal.writeLine('by creating temp project tarballs and extracting them during rush install.');
  terminal.writeLine('');

  // Create test repository with npm 6.14.15 (the version from rush init template)
  await helper.createTestRepoAsync(testRepoPath, 'npm', '6.14.15');

  // Create project A (dependency)
  terminal.writeLine('Creating test-project-a...');
  await helper.createTestProjectAsync(
    testRepoPath,
    'test-project-a',
    '1.0.0',
    { lodash: '^4.17.21' },
    `node -e "require('fs').mkdirSync('lib', {recursive: true}); require('fs').writeFileSync('lib/index.js', 'module.exports = { greet: () => \\"Hello from A\\" };');"`
  );

  // Create project B (depends on A)
  terminal.writeLine('Creating test-project-b...');
  await helper.createTestProjectAsync(
    testRepoPath,
    'test-project-b',
    '1.0.0',
    {
      'test-project-a': '1.0.0',
      moment: '^2.29.4'
    },
    `node -e "const a = require('test-project-a'); require('fs').mkdirSync('lib', {recursive: true}); require('fs').writeFileSync('lib/index.js', 'module.exports = { test: () => \\"Using: \\" + require(\\'test-project-a\\').greet() };');"`
  );

  // Run rush update (creates and extracts temp project tarballs)
  terminal.writeLine('');
  terminal.writeLine("Running 'rush update' (creates and extracts temp project tarballs using tar 7.x)...");
  await helper.executeRushAsync(['update'], testRepoPath);

  // Verify temp project tarballs were created
  await helper.verifyTempTarballsAsync(testRepoPath, ['test-project-a', 'test-project-b']);

  // Run rush install (extracts temp project tarballs)
  terminal.writeLine('');
  terminal.writeLine("Running 'rush install' (extracts temp project tarballs using tar 7.x)...");
  await helper.executeRushAsync(['install'], testRepoPath);

  // Verify node_modules were populated correctly
  await helper.verifyDependenciesAsync(testRepoPath, 'test-project-a', ['lodash']);
  await helper.verifyDependenciesAsync(testRepoPath, 'test-project-b', ['test-project-a']);

  // Run rush build
  terminal.writeLine('');
  terminal.writeLine("Running 'rush build'...");
  await helper.executeRushAsync(['build'], testRepoPath);

  // Verify build outputs
  await helper.verifyBuildOutputsAsync(testRepoPath, ['test-project-a', 'test-project-b']);

  // Test that the built code actually works
  await helper.testBuiltCodeAsync(testRepoPath, 'test-project-b');

  terminal.writeLine('');
  terminal.writeLine('==========================================');
  terminal.writeLine('✓ NPM Mode Integration Test PASSED');
  terminal.writeLine('==========================================');
  terminal.writeLine('');
  terminal.writeLine('The tar 7.x changes work correctly with npm mode:');
  terminal.writeLine('  - Temp project tarballs created successfully');
  terminal.writeLine('  - Tarballs extracted correctly during install');
  terminal.writeLine('  - Dependencies linked properly');
  terminal.writeLine('  - Build completed successfully');
  terminal.writeLine('');
}

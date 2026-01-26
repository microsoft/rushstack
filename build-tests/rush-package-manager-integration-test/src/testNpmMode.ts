// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { TestHelper } from './TestHelper';

/**
 * Integration test for Rush npm mode with tar 7.x
 * This test verifies that temp project tarballs work correctly with npm package manager
 */
export async function testNpmModeAsync(): Promise<void> {
  const helper: TestHelper = new TestHelper();
  const testRepoPath: string = path.join(__dirname, '../temp/npm-test-repo');

  console.log('==========================================');
  console.log('Rush NPM Mode Integration Test');
  console.log('==========================================');
  console.log('');
  console.log('This test verifies that tar 7.x changes work correctly with npm package manager');
  console.log('by creating temp project tarballs and extracting them during rush install.');
  console.log('');

  // Create test repository
  await helper.createTestRepoAsync(testRepoPath, 'npm', '8.19.4');

  // Create project A (dependency)
  console.log('Creating test-project-a...');
  helper.createTestProject(
    testRepoPath,
    'test-project-a',
    '1.0.0',
    { lodash: '^4.17.21' },
    `node -e "require('fs').mkdirSync('lib', {recursive: true}); require('fs').writeFileSync('lib/index.js', 'module.exports = { greet: () => \\"Hello from A\\" };');"`
  );

  // Create project B (depends on A)
  console.log('Creating test-project-b...');
  helper.createTestProject(
    testRepoPath,
    'test-project-b',
    '1.0.0',
    {
      'test-project-a': '1.0.0',
      moment: '^2.29.4'
    },
    `node -e "const a = require('test-project-a'); require('fs').mkdirSync('lib', {recursive: true}); require('fs').writeFileSync('lib/index.js', 'module.exports = { test: () => \\"Using: \\" + require(\\'test-project-a\\').greet() };');"`
  );

  // Run rush update (creates temp project tarballs using tar.create)
  console.log('');
  console.log("Running 'rush update' (creates temp project tarballs using tar 7.x)...");
  await helper.executeRushAsync(['update'], testRepoPath);

  // Verify temp project tarballs were created
  helper.verifyTempTarballs(testRepoPath, ['test-project-a', 'test-project-b']);

  // Run rush install (extracts temp project tarballs using tar.extract)
  console.log('');
  console.log("Running 'rush install' (extracts temp project tarballs using tar 7.x)...");
  await helper.executeRushAsync(['install'], testRepoPath);

  // Verify node_modules were populated correctly
  helper.verifyDependencies(testRepoPath, 'test-project-a', ['lodash']);
  helper.verifyDependencies(testRepoPath, 'test-project-b', ['test-project-a']);

  // Run rush build
  console.log('');
  console.log("Running 'rush build'...");
  await helper.executeRushAsync(['build'], testRepoPath);

  // Verify build outputs
  helper.verifyBuildOutputs(testRepoPath, ['test-project-a', 'test-project-b']);

  // Test that the built code actually works
  await helper.testBuiltCodeAsync(testRepoPath, 'test-project-b');

  console.log('');
  console.log('==========================================');
  console.log('✓ NPM Mode Integration Test PASSED');
  console.log('==========================================');
  console.log('');
  console.log('The tar 7.x changes work correctly with npm mode:');
  console.log('  - Temp project tarballs created successfully');
  console.log('  - Tarballs extracted correctly during install');
  console.log('  - Dependencies linked properly');
  console.log('  - Build completed successfully');
  console.log('');
}

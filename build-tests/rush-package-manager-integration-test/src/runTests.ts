// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { testNpmModeAsync } from './testNpmMode';
import { testYarnModeAsync } from './testYarnMode';

/**
 * Main test runner that executes all package manager integration tests
 */
async function runTestsAsync(): Promise<void> {
  console.log('==========================================');
  console.log('Rush Package Manager Integration Tests');
  console.log('==========================================');
  console.log('');
  console.log('These tests verify that the tar 7.x upgrade works correctly');
  console.log('with different Rush package managers (npm, yarn).');
  console.log('');
  console.log('Tests will:');
  console.log('  1. Create Rush repos using locally-built Rush');
  console.log('  2. Add projects with dependencies');
  console.log('  3. Run rush update (creates temp tarballs)');
  console.log('  4. Run rush install (extracts tarballs)');
  console.log('  5. Run rush build (end-to-end verification)');
  console.log('');

  let testsPassed: number = 0;
  let testsFailed: number = 0;
  const failedTests: string[] = [];

  // Run npm mode test
  console.log('==========================================');
  console.log('Running NPM mode test...');
  console.log('==========================================');
  try {
    await testNpmModeAsync();
    testsPassed++;
  } catch (error) {
    testsFailed++;
    failedTests.push('NPM mode');
    console.error('⚠️  NPM mode test FAILED');
    console.error(error);
  }

  // Run yarn mode test
  console.log('==========================================');
  console.log('Running Yarn mode test...');
  console.log('==========================================');
  try {
    await testYarnModeAsync();
    testsPassed++;
  } catch (error) {
    testsFailed++;
    failedTests.push('Yarn mode');
    console.error('⚠️  Yarn mode test FAILED');
    console.error(error);
  }

  // Print summary
  console.log('==========================================');
  console.log('Test Summary');
  console.log('==========================================');
  console.log('');
  console.log(`Tests passed: ${testsPassed}`);
  console.log(`Tests failed: ${testsFailed}`);
  console.log('');

  if (testsFailed > 0) {
    console.log('Failed tests:');
    for (const test of failedTests) {
      console.log(`  - ${test}`);
    }
    console.log('');
    console.log('❌ Some tests failed');
    process.exit(1);
  } else {
    console.log('✅ All tests passed!');
    console.log('');
    console.log('The tar 7.x upgrade is working correctly with:');
    console.log('  - NPM package manager');
    console.log('  - Yarn package manager');
    console.log('');
    process.exit(0);
  }
}

// Run tests and handle errors
runTestsAsync().catch((error) => {
  console.error('Fatal error running tests:');
  console.error(error);
  process.exit(1);
});

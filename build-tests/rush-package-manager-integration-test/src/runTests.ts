// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Terminal, ConsoleTerminalProvider } from '@rushstack/terminal';

import { testNpmModeAsync } from './testNpmMode';
import { testYarnModeAsync } from './testYarnMode';

/**
 * Main test runner that executes all package manager integration tests
 */
async function runTestsAsync(): Promise<void> {
  const terminal: Terminal = new Terminal(new ConsoleTerminalProvider());

  terminal.writeLine('==========================================');
  terminal.writeLine('Rush Package Manager Integration Tests');
  terminal.writeLine('==========================================');
  terminal.writeLine('');
  terminal.writeLine('These tests verify that the tar 7.x upgrade works correctly');
  terminal.writeLine('with different Rush package managers (npm, yarn).');
  terminal.writeLine('');
  terminal.writeLine('Tests will:');
  terminal.writeLine('  1. Create Rush repos using locally-built Rush');
  terminal.writeLine('  2. Add projects with dependencies');
  terminal.writeLine('  3. Run rush update (creates and extracts temp tarballs)');
  terminal.writeLine('  4. Run rush install (extracts tarballs)');
  terminal.writeLine('  5. Run rush build (end-to-end verification)');
  terminal.writeLine('');

  let testsPassed: number = 0;
  let testsFailed: number = 0;
  const failedTests: string[] = [];

  // Run npm mode test
  terminal.writeLine('==========================================');
  terminal.writeLine('Running NPM mode test...');
  terminal.writeLine('==========================================');
  try {
    await testNpmModeAsync(terminal);
    testsPassed++;
  } catch (error) {
    testsFailed++;
    failedTests.push('NPM mode');
    terminal.writeErrorLine('⚠️  NPM mode test FAILED');
    terminal.writeErrorLine(String(error));
  }

  // Run yarn mode test
  terminal.writeLine('==========================================');
  terminal.writeLine('Running Yarn mode test...');
  terminal.writeLine('==========================================');
  try {
    await testYarnModeAsync(terminal);
    testsPassed++;
  } catch (error) {
    testsFailed++;
    failedTests.push('Yarn mode');
    terminal.writeErrorLine('⚠️  Yarn mode test FAILED');
    terminal.writeErrorLine(String(error));
  }

  // Print summary
  terminal.writeLine('==========================================');
  terminal.writeLine('Test Summary');
  terminal.writeLine('==========================================');
  terminal.writeLine('');
  terminal.writeLine(`Tests passed: ${testsPassed}`);
  terminal.writeLine(`Tests failed: ${testsFailed}`);
  terminal.writeLine('');

  if (testsFailed > 0) {
    terminal.writeLine('Failed tests:');
    for (const test of failedTests) {
      terminal.writeLine(`  - ${test}`);
    }
    terminal.writeLine('');
    terminal.writeLine('❌ Some tests failed');
    process.exit(1);
  } else {
    terminal.writeLine('✅ All tests passed!');
    terminal.writeLine('');
    terminal.writeLine('The tar 7.x upgrade is working correctly with:');
    terminal.writeLine('  - NPM package manager');
    terminal.writeLine('  - Yarn package manager');
    terminal.writeLine('');
    process.exit(0);
  }
}

// Run tests and handle errors
runTestsAsync().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Fatal error running tests:');
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});

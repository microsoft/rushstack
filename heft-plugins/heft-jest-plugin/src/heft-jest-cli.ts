// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawnSync, type SpawnSyncReturns } from 'node:child_process';

/**
 * This script acts as a bridge between the VSCode Jest extension and Heft.
 *
 * The VSCode Jest extension expects to run a command that accepts Jest CLI parameters.
 * This script translates those parameters to Heft CLI parameters and executes
 * `heft test` with the appropriate arguments.
 *
 * Example VSCode Jest extension parameters:
 * --testLocationInResults --json --useStderr --outputFile "..." --no-coverage
 * --reporters "default" --reporters "path/to/reporter.js" --colors --watchAll=false
 *
 * @packageDocumentation
 */

interface IHeftJestArgs {
  heftArgs: string[];
  passedTestPathPattern?: string;
  watchMode: boolean;
}

/**
 * Parses Jest CLI arguments and converts them to Heft CLI arguments.
 */
function parseJestArgsToHeft(args: string[]): IHeftJestArgs {
  const heftArgs: string[] = [];
  let watchMode: boolean = false;
  let passedTestPathPattern: string | undefined;
  let i: number = 0;

  while (i < args.length) {
    const arg: string = args[i];

    // Handle --watchAll=false or --watchAll=true
    if (arg.startsWith('--watchAll=')) {
      const value: string = arg.split('=')[1];
      watchMode = value === 'true';
      i++;
      continue;
    }

    // Handle --watchAll (without value means true)
    if (arg === '--watchAll' || arg === '--watch') {
      watchMode = true;
      i++;
      continue;
    }

    // Handle --testPathPattern (or --testPathPatterns for older versions)
    if (arg === '--testPathPattern' || arg === '--testPathPatterns') {
      if (i + 1 < args.length) {
        passedTestPathPattern = args[i + 1];
        heftArgs.push('--test-path-pattern', args[i + 1]);
        i += 2;
        continue;
      }
    }
    if (arg.startsWith('--testPathPattern=')) {
      passedTestPathPattern = arg.split('=')[1];
      heftArgs.push('--test-path-pattern', passedTestPathPattern);
      i++;
      continue;
    }

    // Handle --testNamePattern
    if (arg === '--testNamePattern' || arg === '-t') {
      if (i + 1 < args.length) {
        heftArgs.push('--test-name-pattern', args[i + 1]);
        i += 2;
        continue;
      }
    }
    if (arg.startsWith('--testNamePattern=')) {
      heftArgs.push('--test-name-pattern', arg.split('=')[1]);
      i++;
      continue;
    }

    // Handle --updateSnapshot
    if (arg === '--updateSnapshot' || arg === '-u') {
      heftArgs.push('--update-snapshots');
      i++;
      continue;
    }

    // Handle --maxWorkers
    if (arg === '--maxWorkers') {
      if (i + 1 < args.length) {
        heftArgs.push('--max-workers', args[i + 1]);
        i += 2;
        continue;
      }
    }
    if (arg.startsWith('--maxWorkers=')) {
      heftArgs.push('--max-workers', arg.split('=')[1]);
      i++;
      continue;
    }

    // Handle --testTimeout
    if (arg === '--testTimeout') {
      if (i + 1 < args.length) {
        heftArgs.push('--test-timeout-ms', args[i + 1]);
        i += 2;
        continue;
      }
    }
    if (arg.startsWith('--testTimeout=')) {
      heftArgs.push('--test-timeout-ms', arg.split('=')[1]);
      i++;
      continue;
    }

    // Handle --no-coverage / --coverage=false
    if (arg === '--no-coverage' || arg === '--coverage=false') {
      heftArgs.push('--disable-code-coverage');
      i++;
      continue;
    }

    // Handle --detectOpenHandles
    if (arg === '--detectOpenHandles') {
      heftArgs.push('--detect-open-handles');
      i++;
      continue;
    }

    // Handle --silent
    if (arg === '--silent') {
      heftArgs.push('--silent');
      i++;
      continue;
    }

    // Handle --logHeapUsage
    if (arg === '--logHeapUsage') {
      heftArgs.push('--log-heap-usage');
      i++;
      continue;
    }

    // Parameters that we skip (VSCode Jest extension specific or not needed)
    // --testLocationInResults, --json, --useStderr, --outputFile, --reporters, --colors, --config
    // These are handled by Jest directly or aren't relevant to Heft
    if (
      arg === '--testLocationInResults' ||
      arg === '--json' ||
      arg === '--useStderr' ||
      arg === '--colors' ||
      arg === '--no-colors' ||
      arg === '--runInBand' ||
      arg === '--passWithNoTests'
    ) {
      i++;
      continue;
    }

    // Handle --outputFile (skip with its value)
    if (arg === '--outputFile') {
      // Skip this and the next argument (the file path)
      i += 2;
      continue;
    }
    if (arg.startsWith('--outputFile=')) {
      i++;
      continue;
    }

    // Handle --reporters (skip with its value)
    if (arg === '--reporters') {
      // Skip this and the next argument (the reporter)
      i += 2;
      continue;
    }
    if (arg.startsWith('--reporters=')) {
      i++;
      continue;
    }

    // Handle --config (skip with its value as Heft has its own config handling)
    if (arg === '--config' || arg === '-c') {
      i += 2;
      continue;
    }
    if (arg.startsWith('--config=')) {
      i++;
      continue;
    }

    // Skip any unrecognized arguments
    i++;
  }

  return {
    heftArgs,
    passedTestPathPattern,
    watchMode
  };
}

/**
 * Main entry point for the heft-jest CLI wrapper.
 */
function main(): void {
  // Get the arguments passed to this script (skip node and script path)
  const args: string[] = process.argv.slice(2);

  // Parse Jest arguments and convert to Heft arguments
  const { heftArgs, watchMode } = parseJestArgsToHeft(args);

  // Determine the Heft command to run
  const heftCommand: string = watchMode ? 'test-watch' : 'test';

  // Build the full command
  const fullArgs: string[] = [heftCommand, ...heftArgs];

  // Execute heft with the translated arguments
  // eslint-disable-next-line no-console
  console.log(`[heft-jest] Running: heft ${fullArgs.join(' ')}`);

  // Check if we're in test mode (used by unit tests to verify argument parsing)
  if (process.env.HEFT_JEST_CLI_TEST_MODE === 'true') {
    process.exit(0);
  }

  // Find the heft executable
  // First try to find it in the current project's node_modules
  let heftBinPath: string;
  try {
    heftBinPath = require.resolve('@rushstack/heft/bin/heft', {
      paths: [process.cwd()]
    });
  } catch {
    // Fall back to assuming 'heft' is available in PATH
    heftBinPath = 'heft';
  }

  const result: SpawnSyncReturns<Buffer> = spawnSync(
    process.platform === 'win32' ? 'node' : heftBinPath,
    process.platform === 'win32' ? [heftBinPath, ...fullArgs] : fullArgs,
    {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: process.env
    }
  );

  // Exit with the same code as heft
  process.exit(result.status ?? 1);
}

main();

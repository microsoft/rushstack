// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawnSync } from 'node:child_process';
import * as path from 'node:path';

describe('heft-jest CLI', () => {
  // Path to the compiled heft-jest-cli.js
  const cliPath: string = path.resolve(__dirname, '..', '..', 'lib', 'heft-jest-cli.js');

  // Helper to capture the console output from the CLI
  function runCli(args: string[]): { output: string; exitCode: number } {
    const result = spawnSync('node', [cliPath, ...args], {
      encoding: 'utf-8',
      env: {
        ...process.env,
        // Set a variable to indicate we're in test mode to prevent actual execution
        HEFT_JEST_CLI_TEST_MODE: 'true'
      }
    });

    return {
      output: (result.stdout || '') + (result.stderr || ''),
      exitCode: result.status ?? 1
    };
  }

  describe('argument translation', () => {
    // These tests verify that the CLI correctly translates Jest arguments to Heft arguments
    // by checking the console output which includes the translated command

    it('translates --testPathPattern to --test-path-pattern', () => {
      const { output } = runCli(['--testPathPattern', 'somePattern']);
      expect(output).toContain('--test-path-pattern');
      expect(output).toContain('somePattern');
    });

    it('translates --testPathPattern=value to --test-path-pattern', () => {
      const { output } = runCli(['--testPathPattern=somePattern']);
      expect(output).toContain('--test-path-pattern');
      expect(output).toContain('somePattern');
    });

    it('translates --testNamePattern to --test-name-pattern', () => {
      const { output } = runCli(['--testNamePattern', 'myTest']);
      expect(output).toContain('--test-name-pattern');
      expect(output).toContain('myTest');
    });

    it('translates -t to --test-name-pattern', () => {
      const { output } = runCli(['-t', 'myTest']);
      expect(output).toContain('--test-name-pattern');
      expect(output).toContain('myTest');
    });

    it('translates --updateSnapshot to --update-snapshots', () => {
      const { output } = runCli(['--updateSnapshot']);
      expect(output).toContain('--update-snapshots');
    });

    it('translates -u to --update-snapshots', () => {
      const { output } = runCli(['-u']);
      expect(output).toContain('--update-snapshots');
    });

    it('translates --maxWorkers to --max-workers', () => {
      const { output } = runCli(['--maxWorkers', '4']);
      expect(output).toContain('--max-workers');
      expect(output).toContain('4');
    });

    it('translates --maxWorkers=value to --max-workers', () => {
      const { output } = runCli(['--maxWorkers=50%']);
      expect(output).toContain('--max-workers');
      expect(output).toContain('50%');
    });

    it('translates --testTimeout to --test-timeout-ms', () => {
      const { output } = runCli(['--testTimeout', '10000']);
      expect(output).toContain('--test-timeout-ms');
      expect(output).toContain('10000');
    });

    it('translates --no-coverage to --disable-code-coverage', () => {
      const { output } = runCli(['--no-coverage']);
      expect(output).toContain('--disable-code-coverage');
    });

    it('translates --coverage=false to --disable-code-coverage', () => {
      const { output } = runCli(['--coverage=false']);
      expect(output).toContain('--disable-code-coverage');
    });

    it('translates --detectOpenHandles to --detect-open-handles', () => {
      const { output } = runCli(['--detectOpenHandles']);
      expect(output).toContain('--detect-open-handles');
    });

    it('translates --silent to --silent', () => {
      const { output } = runCli(['--silent']);
      expect(output).toContain('--silent');
    });

    it('translates --logHeapUsage to --log-heap-usage', () => {
      const { output } = runCli(['--logHeapUsage']);
      expect(output).toContain('--log-heap-usage');
    });
  });

  describe('watch mode handling', () => {
    it('uses test command when --watchAll=false', () => {
      const { output } = runCli(['--watchAll=false']);
      expect(output).toContain('heft test');
      expect(output).not.toContain('test-watch');
    });

    it('uses test-watch command when --watchAll=true', () => {
      const { output } = runCli(['--watchAll=true']);
      expect(output).toContain('test-watch');
    });

    it('uses test-watch command when --watchAll is specified without value', () => {
      const { output } = runCli(['--watchAll']);
      expect(output).toContain('test-watch');
    });

    it('uses test-watch command when --watch is specified', () => {
      const { output } = runCli(['--watch']);
      expect(output).toContain('test-watch');
    });
  });

  describe('skipped arguments', () => {
    // These tests verify that VSCode Jest extension specific arguments are skipped

    it('skips --testLocationInResults', () => {
      const { output } = runCli(['--testLocationInResults']);
      expect(output).not.toContain('testLocationInResults');
    });

    it('skips --json', () => {
      const { output } = runCli(['--json']);
      expect(output).not.toContain('--json');
    });

    it('skips --useStderr', () => {
      const { output } = runCli(['--useStderr']);
      expect(output).not.toContain('--useStderr');
    });

    it('skips --colors', () => {
      const { output } = runCli(['--colors']);
      expect(output).not.toContain('--colors');
    });

    it('skips --outputFile with its value', () => {
      const { output } = runCli(['--outputFile', '/tmp/output.json']);
      expect(output).not.toContain('--outputFile');
      expect(output).not.toContain('/tmp/output.json');
    });

    it('skips --outputFile=value', () => {
      const { output } = runCli(['--outputFile=/tmp/output.json']);
      expect(output).not.toContain('--outputFile');
      expect(output).not.toContain('/tmp/output.json');
    });

    it('skips --reporters with its value', () => {
      const { output } = runCli(['--reporters', 'default']);
      expect(output).not.toContain('--reporters');
    });

    it('skips --reporters=value', () => {
      const { output } = runCli(['--reporters=default']);
      expect(output).not.toContain('--reporters');
    });

    it('skips --runInBand', () => {
      const { output } = runCli(['--runInBand']);
      expect(output).not.toContain('--runInBand');
    });

    it('skips --passWithNoTests', () => {
      const { output } = runCli(['--passWithNoTests']);
      expect(output).not.toContain('--passWithNoTests');
    });
  });

  describe('complex argument combinations', () => {
    it('handles typical VSCode Jest extension arguments', () => {
      const args: string[] = [
        '--testLocationInResults',
        '--json',
        '--useStderr',
        '--outputFile',
        '/tmp/jest_results.json',
        '--no-coverage',
        '--reporters',
        'default',
        '--reporters',
        '/path/to/reporter.js',
        '--colors',
        '--watchAll=false',
        '--testPathPattern',
        'MyComponent'
      ];

      const { output } = runCli(args);

      // Should include translated arguments
      expect(output).toContain('heft test');
      expect(output).toContain('--test-path-pattern');
      expect(output).toContain('MyComponent');
      expect(output).toContain('--disable-code-coverage');

      // Should not include skipped arguments
      expect(output).not.toContain('--testLocationInResults');
      expect(output).not.toContain('--json');
      expect(output).not.toContain('--useStderr');
      expect(output).not.toContain('--outputFile');
      expect(output).not.toContain('--reporters');
      expect(output).not.toContain('--colors');
    });
  });
});

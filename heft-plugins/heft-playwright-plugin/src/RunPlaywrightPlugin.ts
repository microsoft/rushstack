// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import child_process from 'node:child_process';
import path from 'node:path';
import { FileSystem, JsonFile, SubprocessTerminator } from '@rushstack/node-core-library';
import { TerminalProviderSeverity, TerminalStreamWritable, type ITerminal } from '@rushstack/terminal';
import type {
  HeftConfiguration,
  IHeftTaskPlugin,
  IHeftTaskRunHookOptions,
  IHeftTaskSession
} from '@rushstack/heft';

/** @beta */
export interface IRunPlaywrightPluginOptions {
  configPath?: string;
}

/** @beta */
export interface IPlaywrightParameters {
  debugMode: boolean;
  headed: boolean;
  list: boolean;
  trace: boolean;
  configPath: string;
  project: string | undefined;
  testPaths: string[];
  grep: string | undefined;
  grepInvert: string | undefined;
  repeatEach: number | undefined;
  retries: number | undefined;
  timeout: number | undefined;
  workers: string | number | undefined;
  ui: boolean;
  uiHost: string | undefined;
  uiPort: string | undefined;
}

const PLUGIN_NAME: 'run-playwright-plugin' = 'run-playwright-plugin';
const DEFAULT_PLAYWRIGHT_BROWSERS: string[] = ['chromium', 'firefox', 'webkit', 'chrome', 'msedge'];

/**
 * Get test file paths by resolving them relative to the build folder
 */
function getTestFilePaths(buildFolderPath: string, testPaths: readonly string[]): string[] {
  return testPaths.map((testPath: string) => path.resolve(buildFolderPath, testPath));
}

/**
 * Create Playwright CLI arguments from parameters
 */
function createPlaywriteCliArgs(parameters: IPlaywrightParameters): string[] {
  const {
    configPath,
    workers,
    debugMode,
    headed,
    timeout,
    list,
    project,
    testPaths,
    grep,
    grepInvert,
    repeatEach,
    retries,
    ui,
    uiHost,
    uiPort
  } = parameters;
  const cliArgs: string[] = [];

  // Always set the config path and the workers directly
  cliArgs.push(`--config=${configPath}`);

  if (workers) {
    cliArgs.push(`--workers=${workers}`);
  }

  if (debugMode) {
    cliArgs.push('--debug');
  }
  if (headed) {
    cliArgs.push('--headed');
  }
  if (timeout) {
    cliArgs.push(`--timeout=${timeout}`);
  }
  if (list) {
    cliArgs.push('--list');
  }
  if (project) {
    cliArgs.push(`--project=${project}`);
  }
  if (grep) {
    cliArgs.push(`--grep=${grep}`);
  }
  if (grepInvert) {
    cliArgs.push(`--grep-invert=${grepInvert}`);
  }
  if (repeatEach) {
    cliArgs.push(`--repeat-each=${repeatEach}`);
  }
  if (retries) {
    cliArgs.push(`--retries=${retries}`);
  }
  if (ui) {
    cliArgs.push('--ui');
  }
  if (uiHost) {
    cliArgs.push(`--ui-host=${uiHost}`);
  }
  if (uiPort) {
    cliArgs.push(`--ui-port=${uiPort}`);
  }

  // Do this after specifying all the other arguments
  if (testPaths.length) {
    cliArgs.push('--');
    for (const testPath of testPaths) {
      cliArgs.push(testPath);
    }
  }

  return cliArgs;
}

/**
 * Install Playwright browsers using the Playwright CLI
 */
async function installPlaywrightBrowsersAsync(
  terminal: ITerminal,
  browsers: readonly string[]
): Promise<void> {
  // Resolve to playwright-core/cli.js for browser installation
  const playwrightCliPath: string = `${path.dirname(require.resolve('playwright-core'))}/cli.js`;
  const installArgs: string[] = [...browsers, '--with-deps', '--force'];

  await new Promise<void>((resolve: () => void, reject: (error: Error) => void) => {
    const forkedProcess: child_process.ChildProcess = child_process.fork(
      playwrightCliPath,
      ['install'].concat(installArgs),
      {
        execArgv: process.execArgv,
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        ...SubprocessTerminator.RECOMMENDED_OPTIONS
      }
    );

    SubprocessTerminator.killProcessTreeOnExit(forkedProcess, SubprocessTerminator.RECOMMENDED_OPTIONS);

    // Pipe stdout and stderr to terminal
    const terminalOutStream: TerminalStreamWritable = new TerminalStreamWritable({
      terminal,
      severity: TerminalProviderSeverity.log
    });
    const terminalErrorStream: TerminalStreamWritable = new TerminalStreamWritable({
      terminal,
      severity: TerminalProviderSeverity.error
    });

    if (forkedProcess.stdout) {
      forkedProcess.stdout.pipe(terminalOutStream);
    }
    if (forkedProcess.stderr) {
      forkedProcess.stderr.pipe(terminalErrorStream);
    }

    let processFinished: boolean = false;
    forkedProcess.on('error', (error: Error) => {
      processFinished = true;
      reject(error);
    });

    forkedProcess.on('exit', (code: number | null) => {
      if (processFinished) {
        return;
      }
      processFinished = true;

      if (code !== 0) {
        reject(new Error(`Browser installation failed with exit code ${code}`));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Run Playwright tests
 */
async function runPlaywrightAsync(options: {
  terminal: ITerminal;
  buildFolderPath: string;
  parameters: IPlaywrightParameters;
  abortSignal: AbortSignal;
}): Promise<void> {
  const { terminal, buildFolderPath, parameters, abortSignal } = options;

  // Check if config exists
  if (!(await FileSystem.existsAsync(parameters.configPath))) {
    throw new Error(
      `Playwright configuration file not found: ${parameters.configPath}\n` +
        `Create a config/playwright.config.js file or specify --config parameter.`
    );
  }

  // Build Playwright CLI arguments using helper function
  const args: string[] = createPlaywriteCliArgs(parameters);

  // Resolve the Playwright CLI path from the consumer's dependencies
  let playwrightTestCliPath: string;
  try {
    playwrightTestCliPath = require.resolve('@playwright/test/cli');
  } catch (error) {
    throw new Error(
      `Cannot find @playwright/test. Make sure it is installed in your project.\n` +
        `Run: npm install --save-dev @playwright/test`
    );
  }

  await new Promise<void>((resolve, reject) => {
    const forkedProcess = child_process.fork(playwrightTestCliPath, ['test', ...args], {
      execArgv: process.execArgv,
      cwd: buildFolderPath,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      env: process.env,
      ...SubprocessTerminator.RECOMMENDED_OPTIONS
    });

    SubprocessTerminator.killProcessTreeOnExit(forkedProcess, SubprocessTerminator.RECOMMENDED_OPTIONS);

    // Pipe stdout/stderr through Terminal streams
    const terminalOutStream = new TerminalStreamWritable({
      terminal,
      severity: TerminalProviderSeverity.log
    });
    const terminalErrorStream = new TerminalStreamWritable({
      terminal,
      severity: TerminalProviderSeverity.error
    });

    if (forkedProcess.stdout) {
      forkedProcess.stdout.pipe(terminalOutStream);
    }
    if (forkedProcess.stderr) {
      forkedProcess.stderr.pipe(terminalErrorStream);
    }

    // Handle abort signal
    const abortHandler = (): void => {
      forkedProcess.kill('SIGTERM');
    };

    if (abortSignal.aborted) {
      forkedProcess.kill('SIGTERM');
      reject(new Error('Operation aborted'));
      return;
    }

    abortSignal.addEventListener('abort', abortHandler);

    let processFinished = false;

    forkedProcess.on('error', (error) => {
      processFinished = true;
      abortSignal.removeEventListener('abort', abortHandler);
      reject(new Error(`Playwright returned error: ${error.message}`));
    });

    forkedProcess.on('exit', (code, signal) => {
      if (processFinished) {
        return;
      }
      processFinished = true;
      abortSignal.removeEventListener('abort', abortHandler);

      if (signal === 'SIGTERM' && abortSignal.aborted) {
        reject(new Error('Operation aborted'));
      } else if (code === 0) {
        terminal.writeLine('Playwright tests completed successfully.');
        resolve();
      } else {
        reject(new Error(`Playwright test process exited with code ${code}`));
      }
    });
  });
}

/**
 * Heft plugin for running Playwright browser tests
 *
 * This plugin executes Playwright tests using the \@playwright/test CLI.
 * It supports common Playwright options like debug mode, headed mode, UI mode,
 * and project selection.
 *
 * @beta
 */
export default class RunPlaywrightPlugin implements IHeftTaskPlugin {
  public apply(taskSession: IHeftTaskSession, heftConfiguration: HeftConfiguration): void {
    const terminal: ITerminal = taskSession.logger.terminal;
    const { buildFolderPath } = heftConfiguration;
    const parameters = taskSession.parameters;

    taskSession.hooks.run.tapPromise(PLUGIN_NAME, async (runOptions: IHeftTaskRunHookOptions) => {
      const installBrowsers: readonly string[] = parameters.getFlagParameter('--install-browsers').value
        ? DEFAULT_PLAYWRIGHT_BROWSERS
        : parameters.getChoiceListParameter('--install-browser').values;

      if (installBrowsers.length) {
        await installPlaywrightBrowsersAsync(terminal, installBrowsers);
        terminal.writeLine(`Installed Playwright browsers: ${installBrowsers.join(', ')}`);
      } else {
        // Determine config path
        const configParam = parameters.getStringParameter('--config').value;
        const playwrightConfigPath = configParam
          ? path.resolve(buildFolderPath, configParam)
          : path.join(buildFolderPath, 'config', 'playwright.config.js');

        const playwrightParameters: IPlaywrightParameters = {
          debugMode: parameters.getFlagParameter('--debug-mode').value,
          headed: parameters.getFlagParameter('--headed').value,
          list: parameters.getFlagParameter('--list').value,
          trace: parameters.getFlagParameter('--trace').value,
          configPath: playwrightConfigPath,
          timeout: parameters.getIntegerParameter('--timeout').value,
          project: parameters.getStringParameter('--project').value,
          testPaths: getTestFilePaths(
            buildFolderPath,
            parameters.getStringListParameter('--test-path').values
          ),
          grep: parameters.getStringParameter('--grep').value,
          grepInvert: parameters.getStringParameter('--grep-invert').value,
          repeatEach: parameters.getIntegerParameter('--repeat-each').value,
          retries: parameters.getIntegerParameter('--retries').value,
          workers: parameters.getStringParameter('--workers').value,
          ui: parameters.getFlagParameter('--ui').value,
          uiHost: parameters.getStringParameter('--ui-host').value,
          uiPort: parameters.getStringParameter('--ui-port').value
        };

        await runPlaywrightAsync({
          terminal,
          buildFolderPath,
          parameters: playwrightParameters,
          abortSignal: runOptions.abortSignal
        });
      }
    });
  }
}

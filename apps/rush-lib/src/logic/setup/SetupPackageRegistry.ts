// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as child_process from 'child_process';
import {
  ConsoleTerminalProvider,
  Executable,
  InternalError,
  JsonObject,
  Terminal
} from '@rushstack/node-core-library';

import { RushConfiguration } from '../../api/RushConfiguration';
import { Utilities } from '../../utilities/Utilities';
import { ISetupPackageRegistryJson, SetupConfiguration } from './SetupConfiguration';

export class SetupPackageRegistry {
  public readonly rushConfiguration: RushConfiguration;
  private readonly _terminal: Terminal;
  private readonly _setupConfiguration: SetupConfiguration;

  public constructor(rushConfiguration: RushConfiguration, isDebug: boolean) {
    this.rushConfiguration = rushConfiguration;

    this._terminal = new Terminal(
      new ConsoleTerminalProvider({
        verboseEnabled: isDebug
      })
    );

    this._setupConfiguration = new SetupConfiguration(
      path.join(this.rushConfiguration.commonRushConfigFolder, 'setup.json')
    );
  }

  public async check(): Promise<void> {
    const packageRegistry: ISetupPackageRegistryJson = this._setupConfiguration.configuration.packageRegistry;
    if (!packageRegistry.enabled) {
      this._terminal.writeVerbose('Skipping package registry setup because packageRegistry.enabled=false');
      return;
    }

    const registryUrl: string = (packageRegistry?.registryUrl || '').trim();
    if (registryUrl.length === 0) {
      throw new Error('The "registryUrl" setting in setup.json is missing or empty');
    }

    if (packageRegistry.registryService !== 'artifactory') {
      throw new InternalError(`The registry service "${packageRegistry.registryService}" is not implemented`);
    }

    Utilities.syncNpmrc(
      this.rushConfiguration.commonRushConfigFolder,
      this.rushConfiguration.commonTempFolder
    );

    const npmArgs: string[] = [
      'view',
      '@rushstack/nonexistent-package',
      '--json',
      '--registry=' + packageRegistry.registryUrl
    ];

    this._terminal.writeLine('Testing NPM registry credentials...');

    const result: child_process.SpawnSyncReturns<string> = Executable.spawnSync('npm', npmArgs, {
      currentWorkingDirectory: this.rushConfiguration.commonTempFolder,
      stdio: ['ignore', 'pipe', 'ignore'],
      // Wait at most 10 seconds for "npm view" to succeed
      timeoutMs: 10 * 1000
    });
    this._terminal.writeLine();

    // (This is not exactly correct, for example Node.js puts a string in error.errno instead of a string.)
    const error: (Error & Partial<NodeJS.ErrnoException>) | undefined = result.error;

    if (error) {
      if (error.code === 'ETIMEDOUT') {
        // For example, an incorrect "https-proxy" setting can hang for a long time
        throw new Error('The "npm view" command timed out; check your .npmrc file for an incorrect setting');
      }

      throw new Error('Error invoking "npm view": ' + result.error);
    }

    if (result.status === 0) {
      throw new InternalError('"npm view" unexpectedly succeeded');
    }

    const jsonOutput: JsonObject = JSON.parse(result.stdout);
    const errorCode: JsonObject = jsonOutput?.error?.code;
    if (typeof errorCode !== 'string') {
      throw new InternalError('The "npm view" command returned unexpected output');
    }

    switch (errorCode) {
      case 'E404':
        this._terminal.write('NPM credentials are working');
        break;
      case 'E401':
      case 'E403':
        this._terminal.writeVerbose('NPM response:\n' + JSON.stringify(jsonOutput, undefined, 2) + '\n\n');
        this._terminal.writeWarning('NPM credentials are missing or expired');
        break;
      default:
        this._terminal.writeVerbose('NPM response:\n' + JSON.stringify(jsonOutput, undefined, 2) + '\n\n');
        throw new Error(`The "npm view" command returned an unexpected error code "${errorCode}"`);
    }
  }
}

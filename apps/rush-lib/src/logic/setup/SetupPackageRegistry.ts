// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as child_process from 'child_process';
import {
  Colors,
  ConsoleTerminalProvider,
  Executable,
  FileSystem,
  InternalError,
  JsonObject,
  NewlineKind,
  Terminal,
  Text
} from '@rushstack/node-core-library';

import { RushConfiguration } from '../../api/RushConfiguration';
import { Utilities } from '../../utilities/Utilities';
import { ISetupPackageRegistryJson, SetupConfiguration } from './SetupConfiguration';
import { WebClient, WebClientResponse } from '../../utilities/WebClient';

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

    // Artifactory does not implement the "npm ping" protocol or any equivalent REST API.
    // But if we query a package that is known not to exist, Artifactory will only return
    // a 404 error if it is successfully authenticated.  We can use this negative query
    // to validate the credentials.
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
        this._terminal.writeLine('NPM credentials are working');
        return;
      case 'E401':
      case 'E403':
        this._terminal.writeVerboseLine(
          'NPM response:\n' + JSON.stringify(jsonOutput, undefined, 2) + '\n\n'
        );
        this._terminal.writeWarningLine('NPM credentials are missing or expired');
        break;
      default:
        this._terminal.writeVerboseLine(
          'NPM response:\n' + JSON.stringify(jsonOutput, undefined, 2) + '\n\n'
        );
        throw new Error(`The "npm view" command returned an unexpected error code "${errorCode}"`);
    }

    this._terminal.writeLine('\nFetching token...');

    const webClient: WebClient = new WebClient();

    webClient.addBasicAuthHeader('[your user name]', '[your token]');

    let queryUrl: string = packageRegistry.registryUrl;
    if (!queryUrl.endsWith('/')) {
      queryUrl += '/';
    }

    // There doesn't seem to be a way to invoke the "/auth" REST endpoint without a resource name.
    // Artifactory's NPM folders always seem to contain a ".npm" folder, so we can use that to obtain
    // our token.
    queryUrl += `auth/.npm`;

    let response: WebClientResponse;
    try {
      response = await webClient.fetch(queryUrl);
    } catch (e) {
      console.log(e.toString());
      return;
    }

    if (!response.ok) {
      throw new Error('Failed to query');
    }

    // We expect a response like this:
    //
    //   @.npm:registry=https://your-company.jfrog.io/your-artifacts/api/npm/npm-private/
    //   //your-company.jfrog.io/your-artifacts/api/npm/npm-private/:_password=dGhlIHRva2VuIGdvZXMgaGVyZQ==
    //   //your-company.jfrog.io/your-artifacts/api/npm/npm-private/:username=your.name@your-company.com
    //   //your-company.jfrog.io/your-artifacts/api/npm/npm-private/:email=your.name@your-company.com
    //   //your-company.jfrog.io/your-artifacts/api/npm/npm-private/:always-auth=true
    const responseText: string = await response.text();
    const responseLines: string[] = Text.convertToLf(responseText).trim().split('\n');
    if (responseLines.length < 2 || !responseLines[0].startsWith('@.npm:')) {
      throw new Error('Unexpected response from Artifactory');
    }
    // Remove the @.npm line
    responseLines.shift();

    // Extract keys such as:
    //   //your-company.jfrog.io/your-artifacts/api/npm/npm-private/:_password=
    //   //your-company.jfrog.io/your-artifacts/api/npm/npm-private/:username=
    //
    // We will delete these lines from .npmrc
    const keysToReplace: Set<string> = new Set();
    for (const responseLine of responseLines) {
      const key: string | undefined = SetupPackageRegistry._getNpmrcKey(responseLine);
      if (key !== undefined) {
        keysToReplace.add(key);
      }
    }

    const npmrcPath: string = path.join(Utilities.getHomeFolder(), '.npmrc');

    this._terminal.writeLine();
    this._terminal.writeLine(Colors.green('Adding Artifactory token to: '), npmrcPath);

    const npmrcLines: string[] = [];

    if (FileSystem.exists(npmrcPath)) {
      const npmrcContent: string = FileSystem.readFile(npmrcPath, { convertLineEndings: NewlineKind.Lf });
      npmrcLines.push(...npmrcContent.trimRight().split('\n'));
    }

    // Delete the old keys
    for (let i: number = 0; i < npmrcLines.length; ) {
      const line: string = npmrcLines[i];

      const key: string | undefined = SetupPackageRegistry._getNpmrcKey(line);
      if (key && keysToReplace.has(key)) {
        npmrcLines.splice(i, 1);
      } else {
        ++i;
      }
    }

    if (npmrcLines.length > 0 && npmrcLines[npmrcLines.length - 1] !== '') {
      // Append a blank line
      npmrcLines.push('');
    }
    npmrcLines.push(...responseLines);

    // Save the result
    FileSystem.writeFile(npmrcPath, npmrcLines.join('\n') + '\n');
  }

  private static _getNpmrcKey(npmrcLine: string): string | undefined {
    if (/^\s*#/.test(npmrcLine)) {
      return undefined;
    }
    const delimiterIndex: number = npmrcLine.indexOf('=');
    if (delimiterIndex < 1) {
      return undefined;
    }
    const key: string = npmrcLine.substring(0, delimiterIndex + 1);
    return key;
  }
}

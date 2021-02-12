// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as child_process from 'child_process';
import {
  AlreadyReportedError,
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
import { IArtifactoryPackageRegistryJson, ArtifactoryConfiguration } from './ArtifactoryConfiguration';
import { WebClient, WebClientResponse } from '../../utilities/WebClient';
import { TerminalInput } from './TerminalInput';

interface IArtifactoryCustomizableMessages {
  introduction: string;
  obtainAnAccount: string;
  visitWebsite: string;
  locateUserName: string;
  locateApiKey: string;
}

const defaultMessages: IArtifactoryCustomizableMessages = {
  introduction: 'This monorepo consumes packages from an Artifactory private NPM registry.',
  obtainAnAccount:
    'Please contact the repository maintainers for help with setting up an Artifactory user account.',
  visitWebsite: 'Please open this URL in your web browser:',
  locateUserName: 'Your user name appears in the upper-right corner of the JFrog website.',
  locateApiKey:
    'Click "Edit Profile" on the JFrog website.  Click the "Generate API Key"' +
    " button if you haven't already done so previously."
};

export interface ISetupPackageRegistryOptions {
  rushConfiguration: RushConfiguration;
  isDebug: boolean;

  /**
   * Whether Utilities.syncNpmrc() has already been called.
   */
  syncNpmrcAlreadyCalled: boolean;
}

export class SetupPackageRegistry {
  private readonly _options: ISetupPackageRegistryOptions;
  public readonly rushConfiguration: RushConfiguration;
  private readonly _terminal: Terminal;
  private readonly _artifactoryConfiguration: ArtifactoryConfiguration;
  private readonly _messages: IArtifactoryCustomizableMessages;

  public constructor(options: ISetupPackageRegistryOptions) {
    this._options = options;
    this.rushConfiguration = options.rushConfiguration;

    this._terminal = new Terminal(
      new ConsoleTerminalProvider({
        verboseEnabled: options.isDebug
      })
    );

    this._artifactoryConfiguration = new ArtifactoryConfiguration(
      path.join(this.rushConfiguration.commonRushConfigFolder, 'artifactory.json')
    );

    this._messages = {
      ...defaultMessages,
      ...this._artifactoryConfiguration.configuration.packageRegistry.messageOverrides
    };
  }

  private _writeInstructionBlock(message: string): void {
    if (message === '') {
      return;
    }

    this._terminal.writeLine(Utilities.wrapWords(message));
    this._terminal.writeLine();
  }

  /**
   * Test whether the NPM token is valid.
   *
   * @returns - `true` if valid, `false` if not valid
   */
  public async checkOnly(): Promise<boolean> {
    const packageRegistry: IArtifactoryPackageRegistryJson = this._artifactoryConfiguration.configuration
      .packageRegistry;
    if (!packageRegistry.enabled) {
      this._terminal.writeVerbose('Skipping package registry setup because packageRegistry.enabled=false');
      return true;
    }

    const registryUrl: string = (packageRegistry?.registryUrl || '').trim();
    if (registryUrl.length === 0) {
      throw new Error('The "registryUrl" setting in artifactory.json is missing or empty');
    }

    if (!this._options.syncNpmrcAlreadyCalled) {
      Utilities.syncNpmrc(
        this.rushConfiguration.commonRushConfigFolder,
        this.rushConfiguration.commonTempFolder
      );
    }

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

    this._terminal.writeLine('Testing access to private NPM registry: ' + packageRegistry.registryUrl);

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
        this._terminal.writeLine();
        return true;
      case 'E401':
      case 'E403':
        this._terminal.writeVerboseLine(
          'NPM response:\n' + JSON.stringify(jsonOutput, undefined, 2) + '\n\n'
        );
        // Credentials are missing or expired
        return false;
      default:
        this._terminal.writeVerboseLine(
          'NPM response:\n' + JSON.stringify(jsonOutput, undefined, 2) + '\n\n'
        );
        throw new Error(`The "npm view" command returned an unexpected error code "${errorCode}"`);
    }
  }

  /**
   * Test whether the NPM token is valid.  If not, prompt to update it.
   */
  public async checkAndSetup(): Promise<void> {
    if (await this.checkOnly()) {
      return;
    }

    this._terminal.writeWarningLine('NPM credentials are missing or expired');
    this._terminal.writeLine();

    const packageRegistry: IArtifactoryPackageRegistryJson = this._artifactoryConfiguration.configuration
      .packageRegistry;

    const fixThisProblem: boolean = await TerminalInput.promptYesNo({
      message: 'Fix this problem now?',
      defaultValue: false
    });
    this._terminal.writeLine();
    if (!fixThisProblem) {
      return;
    }

    this._writeInstructionBlock(this._messages.introduction);

    const hasArtifactoryAccount: boolean = await TerminalInput.promptYesNo({
      message: 'Do you already have an Artifactory user account?'
    });
    this._terminal.writeLine();

    if (!hasArtifactoryAccount) {
      this._writeInstructionBlock(this._messages.obtainAnAccount);
      throw new AlreadyReportedError();
    }

    if (this._messages.visitWebsite) {
      this._writeInstructionBlock(this._messages.visitWebsite);

      const artifactoryWebsiteUrl: string = this._artifactoryConfiguration.configuration.packageRegistry
        .artifactoryWebsiteUrl;

      if (artifactoryWebsiteUrl) {
        this._terminal.writeLine('  ', Colors.cyan(artifactoryWebsiteUrl));
        this._terminal.writeLine();
      }
    }

    this._writeInstructionBlock(this._messages.locateUserName);

    let artifactoryUser: string = await TerminalInput.promptLine({
      message: 'What is your Artifactory user name?'
    });
    this._terminal.writeLine();

    artifactoryUser = artifactoryUser.trim();
    if (artifactoryUser.length === 0) {
      this._terminal.writeLine(Colors.red('Operation aborted because the input was empty'));
      this._terminal.writeLine();
      throw new AlreadyReportedError();
    }

    this._writeInstructionBlock(this._messages.locateApiKey);

    let artifactoryKey: string = await TerminalInput.promptPasswordLine({
      message: 'What is your Artifactory API key?'
    });
    this._terminal.writeLine();

    artifactoryKey = artifactoryKey.trim();
    if (artifactoryKey.length === 0) {
      this._terminal.writeLine(Colors.red('Operation aborted because the input was empty'));
      this._terminal.writeLine();
      throw new AlreadyReportedError();
    }

    await this._fetchTokenAndUpdateNpmrc(artifactoryUser, artifactoryKey, packageRegistry);
  }

  /**
   * Fetch a valid NPM token from the Artifactory service and add it to the `~/.npmrc` file,
   * preserving other settings in that file.
   */
  private async _fetchTokenAndUpdateNpmrc(
    artifactoryUser: string,
    artifactoryKey: string,
    packageRegistry: IArtifactoryPackageRegistryJson
  ): Promise<void> {
    this._terminal.writeLine('\nFetching an NPM token from the Artifactory service...');

    const webClient: WebClient = new WebClient();

    webClient.addBasicAuthHeader(artifactoryUser, artifactoryKey);

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
      if (response.status === 401) {
        throw new Error('Authorization failed; the Artifactory user name or API key may be incorrect.');
      }

      throw new Error(`The Artifactory request failed:\n  (${response.status}) ${response.statusText}`);
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
    const updatedLinesMap: Map<string, string> = new Map(); // key --> complete line

    for (const globallyMappedNpmScope of packageRegistry.globallyMappedNpmScopes || []) {
      // We'll add a line like:
      //   @company:registry=https://your-company.jfrog.io/your-artifacts/api/npm/npm-private/
      const key: string = `${globallyMappedNpmScope}:registry=`;

      updatedLinesMap.set(key, key + packageRegistry.registryUrl);
    }

    for (const responseLine of responseLines) {
      const key: string | undefined = SetupPackageRegistry._getNpmrcKey(responseLine);
      if (key !== undefined) {
        updatedLinesMap.set(key, responseLine);
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

    if (npmrcLines.length === 1 && npmrcLines[0] === '') {
      // Edge case where split() adds a blank line to the start of the file
      npmrcLines.length = 0;
    }

    // Replace existing lines
    for (let i: number = 0; i < npmrcLines.length; ++i) {
      const line: string = npmrcLines[i];

      const key: string | undefined = SetupPackageRegistry._getNpmrcKey(line);
      if (key) {
        const newValue: string | undefined = updatedLinesMap.get(key);
        if (newValue !== undefined) {
          npmrcLines[i] = newValue;

          // Delete it; anything that doesn't get deleted will be appended at the end
          updatedLinesMap.delete(key);
        }
      }
    }

    if (npmrcLines.length > 0 && npmrcLines[npmrcLines.length - 1] !== '') {
      // Append a blank line
      npmrcLines.push('');
    }

    // Add any remaining values that weren't matched above
    npmrcLines.push(...updatedLinesMap.values());

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

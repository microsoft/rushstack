// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';

import { CommandLineAction } from '@rushstack/ts-command-line';
import { Colorize, type ITerminal } from '@rushstack/terminal';
import { RushConfiguration } from '@rushstack/rush-sdk';
import { FileSystem } from '@rushstack/node-core-library';

import type { LintCommandLineParser } from '../LintCommandLineParser';
import { LOCKFILE_EXPLORER_FOLDERNAME, LOCKFILE_LINT_JSON_FILENAME } from '../../../constants/common';

export class InitAction extends CommandLineAction {
  private readonly _terminal: ITerminal;

  public constructor(parser: LintCommandLineParser) {
    super({
      actionName: 'init',
      summary: `Create a new ${LOCKFILE_LINT_JSON_FILENAME} config file`,
      documentation:
        `This command initializes a new ${LOCKFILE_LINT_JSON_FILENAME} config file.` +
        `  The created template file includes source code comments that document the settings.`
    });
    this._terminal = parser.globalTerminal;
  }

  protected override async onExecuteAsync(): Promise<void> {
    const rushConfiguration: RushConfiguration | undefined = RushConfiguration.tryLoadFromDefaultLocation();
    if (!rushConfiguration) {
      throw new Error(
        'The "lockfile-explorer check" must be executed in a folder that is under a Rush workspace folder'
      );
    }
    const inputFilePath: string = path.resolve(
      __dirname,
      '../../../assets/lint-init/lockfile-lint-template.json'
    );
    const outputFilePath: string = path.resolve(
      rushConfiguration.commonFolder,
      'config',
      LOCKFILE_EXPLORER_FOLDERNAME,
      LOCKFILE_LINT_JSON_FILENAME
    );

    if (await FileSystem.existsAsync(outputFilePath)) {
      this._terminal.writeError('The output file already exists:');
      this._terminal.writeLine('\n  ' + outputFilePath + '\n');
      throw new Error('Unable to write output file');
    }

    this._terminal.writeLine(Colorize.green('Writing file: ') + outputFilePath);
    await FileSystem.copyFileAsync({
      sourcePath: inputFilePath,
      destinationPath: outputFilePath
    });
  }
}

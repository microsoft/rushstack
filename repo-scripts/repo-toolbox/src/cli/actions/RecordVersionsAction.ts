// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { JsonFile } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';
import { RushConfiguration } from '@microsoft/rush-lib';
import { CommandLineAction, type CommandLineStringParameter } from '@rushstack/ts-command-line';

export class RecordVersionsAction extends CommandLineAction {
  private readonly _outFilePath: CommandLineStringParameter;

  private readonly _terminal: ITerminal;

  public constructor(terminal: ITerminal) {
    super({
      actionName: 'record-versions',
      summary: 'Generates a JSON file recording the version numbers of all published packages.',
      documentation: ''
    });

    this._terminal = terminal;

    this._outFilePath = this.defineStringParameter({
      parameterLongName: '--out-file',
      parameterShortName: '-o',
      argumentName: 'FILE_PATH',
      description: 'The path to the output file.',
      required: true
    });
  }

  protected override async onExecuteAsync(): Promise<void> {
    const terminal: ITerminal = this._terminal;
    const rushConfig: RushConfiguration = RushConfiguration.loadFromDefaultLocation({
      startingFolder: process.cwd()
    });

    terminal.writeLine(`Found Rush configuration at ${rushConfig.rushJsonFile}`);

    const publishedPackageVersions: Record<string, string> = {};
    for (const project of rushConfig.projects) {
      if (project.shouldPublish || project.versionPolicy) {
        publishedPackageVersions[project.packageName] = project.packageJson.version;
      }
    }

    const resolvedOutputPath: string = path.resolve(process.cwd(), this._outFilePath.value!);
    await JsonFile.saveAsync(publishedPackageVersions, resolvedOutputPath, {
      ensureFolderExists: true
    });

    terminal.writeLine(`Wrote file to ${resolvedOutputPath}`);
  }
}

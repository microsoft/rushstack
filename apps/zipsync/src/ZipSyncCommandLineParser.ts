// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineParser } from '@rushstack/ts-command-line/lib/providers/CommandLineParser';
import type {
  CommandLineFlagParameter,
  IRequiredCommandLineStringParameter,
  IRequiredCommandLineChoiceParameter,
  IRequiredCommandLineStringListParameter
} from '@rushstack/ts-command-line/lib/index';
import type { ConsoleTerminalProvider } from '@rushstack/terminal/lib/ConsoleTerminalProvider';
import type { ITerminal } from '@rushstack/terminal/lib/ITerminal';

import type { IZipSyncMode, ZipSyncOptionCompression } from './zipSyncUtils';
import { pack, unpack } from './index';

export class ZipSyncCommandLineParser extends CommandLineParser {
  private readonly _debugParameter: CommandLineFlagParameter;
  private readonly _verboseParameter: CommandLineFlagParameter;
  private readonly _modeParameter: IRequiredCommandLineChoiceParameter<IZipSyncMode>;
  private readonly _archivePathParameter: IRequiredCommandLineStringParameter;
  private readonly _baseDirParameter: IRequiredCommandLineStringParameter;
  private readonly _targetDirectoriesParameter: IRequiredCommandLineStringListParameter;
  private readonly _compressionParameter: IRequiredCommandLineChoiceParameter<ZipSyncOptionCompression>;
  private readonly _terminal: ITerminal;
  private readonly _terminalProvider: ConsoleTerminalProvider;

  public constructor(terminalProvider: ConsoleTerminalProvider, terminal: ITerminal) {
    super({
      toolFilename: 'zipsync',
      toolDescription: ''
    });

    this._terminal = terminal;
    this._terminalProvider = terminalProvider;

    this._debugParameter = this.defineFlagParameter({
      parameterLongName: '--debug',
      parameterShortName: '-d',
      description: 'Show the full call stack if an error occurs while executing the tool'
    });

    this._verboseParameter = this.defineFlagParameter({
      parameterLongName: '--verbose',
      parameterShortName: '-v',
      description: 'Show verbose output'
    });

    this._modeParameter = this.defineChoiceParameter<IZipSyncMode>({
      parameterLongName: '--mode',
      parameterShortName: '-m',
      description:
        'The mode of operation: "pack" to create a zip archive, or "unpack" to extract files from a zip archive',
      alternatives: ['pack', 'unpack'],
      required: true
    });

    this._archivePathParameter = this.defineStringParameter({
      parameterLongName: '--archive-path',
      parameterShortName: '-a',
      description: 'Zip file path',
      argumentName: 'ARCHIVE_PATH',
      required: true
    });

    this._targetDirectoriesParameter = this.defineStringListParameter({
      parameterLongName: '--target-directory',
      parameterShortName: '-t',
      description: 'Target directories to pack or unpack',
      argumentName: 'TARGET_DIRECTORIES',
      required: true
    });

    this._baseDirParameter = this.defineStringParameter({
      parameterLongName: '--base-dir',
      parameterShortName: '-b',
      description: 'Base directory for relative paths within the archive',
      argumentName: 'BASE_DIR',
      required: true
    });

    this._compressionParameter = this.defineChoiceParameter<ZipSyncOptionCompression>({
      parameterLongName: '--compression',
      parameterShortName: '-z',
      description:
        'Compression strategy when packing. "deflate" attempts DEFLATE for every file (keeps only if smaller); "auto" first skips likely-compressed types before attempting; "store" disables compression.',
      alternatives: ['store', 'deflate', 'auto'],
      required: true
    });
  }

  protected override async onExecuteAsync(): Promise<void> {
    if (this._debugParameter.value) {
      // eslint-disable-next-line no-debugger
      debugger;
      this._terminalProvider.debugEnabled = true;
      this._terminalProvider.verboseEnabled = true;
    }
    if (this._verboseParameter.value) {
      this._terminalProvider.verboseEnabled = true;
    }
    try {
      if (this._modeParameter.value === 'pack') {
        pack({
          terminal: this._terminal,
          archivePath: this._archivePathParameter.value,
          targetDirectories: this._targetDirectoriesParameter.values,
          baseDir: this._baseDirParameter.value,
          compression: this._compressionParameter.value
        });
      } else if (this._modeParameter.value === 'unpack') {
        unpack({
          terminal: this._terminal,
          archivePath: this._archivePathParameter.value,
          targetDirectories: this._targetDirectoriesParameter.values,
          baseDir: this._baseDirParameter.value
        });
      }
    } catch (error) {
      this._terminal.writeErrorLine('\n' + error.stack);
    }
  }
}

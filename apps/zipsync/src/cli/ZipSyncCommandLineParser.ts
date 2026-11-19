// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineParser } from '@rushstack/ts-command-line/lib/providers/CommandLineParser';
import type {
  CommandLineFlagParameter,
  IRequiredCommandLineStringParameter,
  IRequiredCommandLineChoiceParameter,
  CommandLineStringListParameter
} from '@rushstack/ts-command-line/lib/index';
import type { ConsoleTerminalProvider } from '@rushstack/terminal/lib/ConsoleTerminalProvider';
import type { ITerminal } from '@rushstack/terminal/lib/ITerminal';

import type { IZipSyncMode, ZipSyncOptionCompression } from '../zipSyncUtils';
import { pack, unpack } from '../index';

export class ZipSyncCommandLineParser extends CommandLineParser {
  readonly #debugParameter: CommandLineFlagParameter;
  readonly #verboseParameter: CommandLineFlagParameter;
  readonly #modeParameter: IRequiredCommandLineChoiceParameter<IZipSyncMode>;
  readonly #archivePathParameter: IRequiredCommandLineStringParameter;
  readonly #baseDirParameter: IRequiredCommandLineStringParameter;
  readonly #targetDirectoriesParameter: CommandLineStringListParameter;
  readonly #compressionParameter: IRequiredCommandLineChoiceParameter<ZipSyncOptionCompression>;
  readonly #terminal: ITerminal;
  readonly #terminalProvider: ConsoleTerminalProvider;

  public constructor(terminalProvider: ConsoleTerminalProvider, terminal: ITerminal) {
    super({
      toolFilename: 'zipsync',
      toolDescription: ''
    });

    this.#terminal = terminal;
    this.#terminalProvider = terminalProvider;

    this.#debugParameter = this.defineFlagParameter({
      parameterLongName: '--debug',
      parameterShortName: '-d',
      description: 'Show the full call stack if an error occurs while executing the tool'
    });

    this.#verboseParameter = this.defineFlagParameter({
      parameterLongName: '--verbose',
      parameterShortName: '-v',
      description: 'Show verbose output'
    });

    this.#modeParameter = this.defineChoiceParameter<IZipSyncMode>({
      parameterLongName: '--mode',
      parameterShortName: '-m',
      description:
        'The mode of operation: "pack" to create a zip archive, or "unpack" to extract files from a zip archive',
      alternatives: ['pack', 'unpack'],
      required: true
    });

    this.#archivePathParameter = this.defineStringParameter({
      parameterLongName: '--archive-path',
      parameterShortName: '-a',
      description: 'Zip file path',
      argumentName: 'ARCHIVE_PATH',
      required: true
    });

    this.#targetDirectoriesParameter = this.defineStringListParameter({
      parameterLongName: '--target-directory',
      parameterShortName: '-t',
      description: 'Target directories to pack or unpack',
      argumentName: 'TARGET_DIRECTORIES',
      required: true
    });

    this.#baseDirParameter = this.defineStringParameter({
      parameterLongName: '--base-dir',
      parameterShortName: '-b',
      description: 'Base directory for relative paths within the archive',
      argumentName: 'BASE_DIR',
      required: true
    });

    this.#compressionParameter = this.defineChoiceParameter<ZipSyncOptionCompression>({
      parameterLongName: '--compression',
      parameterShortName: '-z',
      description:
        'Compression strategy when packing. "deflate" and "zlib" attempts compression for every file (keeps only if smaller); "auto" first skips likely-compressed types before attempting "deflate" compression; "store" disables compression.',
      alternatives: ['store', 'deflate', 'zstd', 'auto'],
      required: true
    });
  }

  protected override async onExecuteAsync(): Promise<void> {
    if (this.#debugParameter.value) {
      // eslint-disable-next-line no-debugger
      debugger;
      this.#terminalProvider.debugEnabled = true;
      this.#terminalProvider.verboseEnabled = true;
    }
    if (this.#verboseParameter.value) {
      this.#terminalProvider.verboseEnabled = true;
    }
    try {
      if (this.#modeParameter.value === 'pack') {
        pack({
          terminal: this.#terminal,
          archivePath: this.#archivePathParameter.value,
          targetDirectories: this.#targetDirectoriesParameter.values,
          baseDir: this.#baseDirParameter.value,
          compression: this.#compressionParameter.value
        });
      } else if (this.#modeParameter.value === 'unpack') {
        unpack({
          terminal: this.#terminal,
          archivePath: this.#archivePathParameter.value,
          targetDirectories: this.#targetDirectoriesParameter.values,
          baseDir: this.#baseDirParameter.value
        });
      }
    } catch (error) {
      this.#terminal.writeErrorLine('\n' + error.stack);
    }
  }
}

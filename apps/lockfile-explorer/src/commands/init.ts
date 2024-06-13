// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushConfiguration } from '@rushstack/rush-sdk';
import { FileSystem } from '@rushstack/node-core-library';
import { Colorize } from '@rushstack/terminal';
import type { CommandModule } from 'yargs';
import * as path from 'path';

import { LOCKFILE_EXPLORER_FOLDERNAME, LOCKFILE_LINT_JSON_FILENAME } from '../constants/common';
import { terminal } from '../utils/logger';

// Example usage: lflint init
// Example usage: lockfile-lint init
export const initCommand: CommandModule = {
  command: 'init',
  describe: `Create ${LOCKFILE_LINT_JSON_FILENAME} config file`,
  // eslint-disable-next-line @typescript-eslint/naming-convention
  handler: async () => {
    try {
      const rushConfiguration: RushConfiguration | undefined = RushConfiguration.tryLoadFromDefaultLocation();
      if (!rushConfiguration) {
        throw new Error(
          'The "lockfile-explorer check" must be executed in a folder that is under a Rush workspace folder'
        );
      }
      const inputFilePath: string = path.resolve(
        __dirname,
        '../assets/lint-init/lockfile-lint-template.json'
      );
      const outputFilePath: string = path.resolve(
        rushConfiguration.commonFolder,
        'config',
        LOCKFILE_EXPLORER_FOLDERNAME,
        LOCKFILE_LINT_JSON_FILENAME
      );

      if (await FileSystem.existsAsync(outputFilePath)) {
        terminal.writeError('The output file already exists:');
        terminal.writeLine('\n  ' + outputFilePath + '\n');
        throw new Error('Unable to write output file');
      }

      terminal.writeLine(Colorize.green('Writing file: ') + outputFilePath);
      await FileSystem.copyFileAsync({
        sourcePath: inputFilePath,
        destinationPath: outputFilePath
      });
    } catch (error) {
      terminal.writeError('ERROR: ' + error.message);
      process.exit(1);
    }
  }
};

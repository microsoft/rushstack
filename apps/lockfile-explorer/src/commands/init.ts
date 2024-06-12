// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushConfiguration } from '@microsoft/rush-lib';
import { FileSystem } from '@rushstack/node-core-library';
import { Colorize } from '@rushstack/terminal';
import type { CommandModule } from 'yargs';
import * as path from 'path';

// Example usage: lflint init
// Example usage: lockfile-lint init
export const initCommand: CommandModule<{}, {}> = {
  command: 'init',
  describe: 'Check if the specified package has a inconsistent package versions in target project',
  handler: () => {
    try {
      const rushConfiguration: RushConfiguration | undefined = RushConfiguration.tryLoadFromDefaultLocation();
      if (!rushConfiguration) {
        throw new Error(
          'The "lockfile-explorer check" must be executed in a folder that is under a Rush workspace folder'
        );
      }
      const inputFilePath: string = path.resolve(__dirname, '../schemas/lockfile-lint-template.json');
      const outputFilePath: string = path.resolve(
        rushConfiguration.commonLockfileExplorerConfigFolder,
        'lockfile-lint.json'
      );

      if (FileSystem.exists(outputFilePath)) {
        console.log(Colorize.red('The output file already exists:'));
        console.log('\n  ' + outputFilePath + '\n');
        throw new Error('Unable to write output file');
      }

      console.log(Colorize.green('Writing file: ') + outputFilePath);
      FileSystem.copyFile({
        sourcePath: inputFilePath,
        destinationPath: outputFilePath
      });
    } catch (error) {
      console.error(Colorize.red('ERROR: ' + error.message));
      process.exit(1);
    }
  }
};

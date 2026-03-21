// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import type { IRequiredCommandLineStringParameter } from '@rushstack/ts-command-line';
import { JsonFile } from '@rushstack/node-core-library';
import type {
  IGlobalCommand,
  ILogger,
  IRushPlugin,
  RushConfiguration,
  RushSession
} from '@rushstack/rush-sdk';

const PLUGIN_NAME: 'PublishedVersionsJsonPlugin' = 'PublishedVersionsJsonPlugin';

/**
 * A Rush plugin for generating a JSON file containing the versions of all published packages in the monorepo.
 * @public
 */
export class PublishedVersionsJsonPlugin implements IRushPlugin {
  public readonly pluginName: string = PLUGIN_NAME;

  public apply(session: RushSession, rushConfiguration: RushConfiguration): void {
    session.hooks.runGlobalCustomCommand
      .for('record-published-versions')
      .tapPromise(PLUGIN_NAME, async (command: IGlobalCommand) => {
        if (typeof command.setHandled !== 'function') {
          throw new Error(
            `${PLUGIN_NAME} requires Rush version 5.171.0 or newer. ` +
              'Please upgrade your Rush installation.'
          );
        }
        command.setHandled();

        const { terminal }: ILogger = session.getLogger(PLUGIN_NAME);

        const outputPathParameter: IRequiredCommandLineStringParameter =
          command.getCustomParametersByLongName('--output-path');

        const publishedPackageVersions: Record<string, string> = {};
        for (const {
          shouldPublish,
          packageName,
          packageJson: { version }
        } of rushConfiguration.projects) {
          if (shouldPublish) {
            // Note that `shouldPublish` is also `true` when publishing is driven by a version policy.
            publishedPackageVersions[packageName] = version;
          }
        }

        const resolvedOutputPath: string = path.resolve(process.cwd(), outputPathParameter.value);
        await JsonFile.saveAsync(publishedPackageVersions, resolvedOutputPath, {
          ensureFolderExists: true
        });

        terminal.writeLine(`Wrote file to ${resolvedOutputPath}`);
      });
  }
}

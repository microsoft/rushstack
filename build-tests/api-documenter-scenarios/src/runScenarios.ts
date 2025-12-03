// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ChildProcess } from 'node:child_process';

import { runScenariosAsync } from 'run-scenarios-helpers';

import type { IRunScriptOptions } from '@rushstack/heft';
import { Executable, FileSystem, JsonFile } from '@rushstack/node-core-library';

export async function runAsync(runScriptOptions: IRunScriptOptions): Promise<void> {
  const {
    heftConfiguration: { buildFolderPath }
  } = runScriptOptions;

  const apiDocumenterJsonPath: string = `${buildFolderPath}/config/api-documenter.json`;

  try {
    await runScenariosAsync(runScriptOptions, {
      libFolderPath: __dirname,
      afterApiExtractorAsync: async (scenarioFolderName: string) => {
        // API Documenter will always look for a config file in the same place (it cannot be configured), so this script
        // manually overwrites the API documenter config for each scenario. This is in contrast to the separate config files
        // created when invoking API Extractor above.
        const apiDocumenterOverridesPath: string = `${buildFolderPath}/src/${scenarioFolderName}/config/api-documenter-overrides.json`;
        let apiDocumenterJsonOverrides: {} | undefined;
        try {
          apiDocumenterJsonOverrides = await JsonFile.loadAsync(apiDocumenterOverridesPath);
        } catch (e) {
          if (!FileSystem.isNotExistError(e)) {
            throw e;
          }
        }

        const apiDocumenterJson: {} = {
          $schema: 'https://developer.microsoft.com/json-schemas/api-extractor/v7/api-documenter.schema.json',
          outputTarget: 'markdown',
          tableOfContents: {},
          ...apiDocumenterJsonOverrides
        };

        await JsonFile.saveAsync(apiDocumenterJson, apiDocumenterJsonPath, { ensureFolderExists: true });

        // TODO: Ensure that the checked-in files are up-to-date
        // Run the API Documenter command-line
        const childProcess: ChildProcess = Executable.spawn(
          process.argv0,
          [
            'node_modules/@microsoft/api-documenter/lib/start',
            'generate',
            `--input-folder`,
            `temp/etc/${scenarioFolderName}`,
            '--output-folder',
            `temp/etc/${scenarioFolderName}/markdown`
          ],
          {
            stdio: 'inherit'
          }
        );

        await Executable.waitForExitAsync(childProcess, {
          throwOnNonZeroExitCode: true,
          throwOnSignal: true
        });
      }
    });
  } finally {
    // Delete the transient `api-documenter.json` file before completing, as it'll just be whatever the last scenario
    // was, and shouldn't be committed.
    await FileSystem.deleteFileAsync(apiDocumenterJsonPath);
  }
}

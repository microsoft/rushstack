// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IRunScriptOptions } from '@rushstack/heft';
import { Executable, Import } from '@rushstack/node-core-library';
import { runScenariosAsync } from 'run-scenarios-helpers';

export async function runAsync(runScriptOptions: IRunScriptOptions): Promise<void> {
  await runScenariosAsync(runScriptOptions, {
    libFolderPath: __dirname,
    afterApiExtractorAsync: async (scenarioFolderName: string) => {
      if (scenarioFolderName === 'namespaceImportEquals') {
        const { buildFolderPath } = runScriptOptions.heftConfiguration;
        // Compile a consumer against the generated rollup using API Extractor's TypeScript version.
        const typescriptCompilerPath: string = Import.resolveModule({
          modulePath: 'typescript/bin/tsc',
          baseFolderPath: Import.resolvePackage({
            packageName: '@microsoft/api-extractor',
            baseFolderPath: __dirname
          })
        });
        await Executable.waitForExitAsync(
          Executable.spawn(
            process.execPath,
            [
              typescriptCompilerPath,
              '--project',
              `${buildFolderPath}/test/namespaceImportEquals/tsconfig.json`
            ],
            { stdio: 'inherit' }
          ),
          { throwOnNonZeroExitCode: true, throwOnSignal: true }
        );
      }
    },
    additionalApiExtractorConfig: {
      messages: {
        extractorMessageReporting: {
          // For test purposes, write these warnings into .api.md
          // TODO: Capture the full list of warnings in the tracked test output file
          'ae-cyclic-inherit-doc': {
            logLevel: 'warning',
            addToApiReportFile: true
          },
          'ae-unresolved-link': {
            logLevel: 'warning',
            addToApiReportFile: true
          }
        }
      }
    }
  });
}

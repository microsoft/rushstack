// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IRunScriptOptions } from '@rushstack/heft';
import { AlreadyExistsBehavior, Executable, FileSystem, JsonFile } from '@rushstack/node-core-library';
import {
  Extractor,
  ExtractorConfig,
  CompilerState,
  type ExtractorResult,
  type ExtractorMessage,
  ConsoleMessageId,
  ExtractorLogLevel
} from '@microsoft/api-extractor';
import type { ChildProcess } from 'node:child_process';

const SCENARIO_FOLDER_NAMES: string[] = ['inheritedMembers'];

export async function runAsync({
  heftTaskSession: {
    logger,
    parameters: { production }
  },
  heftConfiguration: { buildFolderPath }
}: IRunScriptOptions): Promise<void> {
  // Copy any .d.ts files into the "lib/" folder
  await FileSystem.copyFilesAsync({
    sourcePath: './src/',
    destinationPath: './lib/',
    alreadyExistsBehavior: AlreadyExistsBehavior.Overwrite,
    filter: (sourcePath: string): boolean => {
      if (sourcePath.endsWith('.d.ts') || !sourcePath.endsWith('.ts')) {
        logger.terminal.writeVerboseLine(`COPY ${sourcePath}`);
        return true;
      }
      return false;
    }
  });

  const entryPoints: string[] = [];

  for (const scenarioFolderName of SCENARIO_FOLDER_NAMES) {
    const entryPoint: string = `${buildFolderPath}/lib/${scenarioFolderName}/index.d.ts`;
    entryPoints.push(entryPoint);

    const apiExtractorOverridesPath: string = `${buildFolderPath}/src/${scenarioFolderName}/config/api-extractor-overrides.json`;
    let apiExtractorJsonOverrides: {};
    try {
      apiExtractorJsonOverrides = await JsonFile.loadAsync(apiExtractorOverridesPath);
    } catch (e) {
      if (!FileSystem.isNotExistError(e)) {
        throw e;
      } else {
        apiExtractorJsonOverrides = {};
      }
    }

    const apiExtractorJson: {} = {
      $schema: 'https://developer.microsoft.com/json-schemas/api-extractor/v7/api-extractor.schema.json',

      mainEntryPointFilePath: entryPoint,

      apiReport: {
        enabled: true,
        reportFolder: `<projectFolder>/etc/${scenarioFolderName}`
      },

      dtsRollup: {
        enabled: true,
        untrimmedFilePath: `<projectFolder>/etc/${scenarioFolderName}/rollup.d.ts`
      },

      docModel: {
        enabled: true,
        apiJsonFilePath: `<projectFolder>/etc/${scenarioFolderName}/<unscopedPackageName>.api.json`
      },

      testMode: true,
      ...apiExtractorJsonOverrides
    };

    const apiExtractorJsonPath: string = `${buildFolderPath}/temp/configs/api-extractor-${scenarioFolderName}.json`;

    await JsonFile.saveAsync(apiExtractorJson, apiExtractorJsonPath, { ensureFolderExists: true });
  }

  const apiDocumenterJsonPath: string = `${buildFolderPath}/config/api-documenter.json`;

  let compilerState: CompilerState | undefined = undefined;
  let anyErrors: boolean = false;

  for (const scenarioFolderName of SCENARIO_FOLDER_NAMES) {
    logger.terminal.writeLine(`Scenario: ${scenarioFolderName}`);

    // Run the API Extractor programmatically
    const apiExtractorJsonPath: string = `${buildFolderPath}/temp/configs/api-extractor-${scenarioFolderName}.json`;
    const extractorConfig: ExtractorConfig = ExtractorConfig.loadFileAndPrepare(apiExtractorJsonPath);

    if (!compilerState) {
      compilerState = CompilerState.create(extractorConfig, {
        additionalEntryPoints: entryPoints
      });
    }

    const extractorResult: ExtractorResult = Extractor.invoke(extractorConfig, {
      localBuild: true,
      showVerboseMessages: true,
      messageCallback: (message: ExtractorMessage) => {
        switch (message.messageId) {
          case ConsoleMessageId.ApiReportCreated:
            // This script deletes the outputs for a clean build, so don't issue a warning if the file gets created
            message.logLevel = ExtractorLogLevel.None;
            break;
          case ConsoleMessageId.Preamble:
            // Less verbose output
            message.logLevel = ExtractorLogLevel.None;
            break;
        }
      },
      compilerState
    });

    if (extractorResult.errorCount > 0) {
      anyErrors = true;
    }

    // API Documenter will always look for a config file in the same place (it cannot be configured), so this script
    // manually overwrites the API documenter config for each scenario. This is in contrast to the separate config files
    // created when invoking API Extractor above.
    const apiDocumenterOverridesPath: string = `${buildFolderPath}/src/${scenarioFolderName}/config/api-documenter-overrides.json`;
    let apiDocumenterJsonOverrides: {};
    try {
      apiDocumenterJsonOverrides = await JsonFile.loadAsync(apiDocumenterOverridesPath);
    } catch (e) {
      if (!FileSystem.isNotExistError(e)) {
        throw e;
      } else {
        apiDocumenterJsonOverrides = {};
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
        `etc/${scenarioFolderName}`,
        '--output-folder',
        `etc/${scenarioFolderName}/markdown`
      ],
      {
        stdio: 'inherit'
      }
    );

    await Executable.waitForExitAsync(childProcess, { throwOnNonZeroExitCode: true, throwOnSignal: true });
  }

  // Delete the transient `api-documenter.json` file before completing, as it'll just be whatever the last scenario
  // was, and shouldn't be committed.
  await FileSystem.deleteFileAsync(apiDocumenterJsonPath);

  if (anyErrors) {
    logger.emitError(new Error('API Extractor encountered errors'));
  }
}

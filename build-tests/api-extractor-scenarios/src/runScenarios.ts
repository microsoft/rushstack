// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { AlreadyExistsBehavior, FileSystem, JsonFile } from '@rushstack/node-core-library';
import {
  Extractor,
  ExtractorConfig,
  CompilerState,
  ExtractorResult,
  ExtractorMessage,
  ConsoleMessageId,
  ExtractorLogLevel
} from '@microsoft/api-extractor';

export function runScenarios(buildConfigPath: string): void {
  const buildConfig = JsonFile.load(buildConfigPath);

  // Copy any .d.ts files into the "lib/" folder
  FileSystem.copyFiles({
    sourcePath: './src/',
    destinationPath: './lib/',
    alreadyExistsBehavior: AlreadyExistsBehavior.Overwrite,
    filter: (sourcePath: string): boolean => {
      if (sourcePath.endsWith('.d.ts') || !sourcePath.endsWith('.ts')) {
        // console.log('COPY ' + sourcePath);
        return true;
      }
      return false;
    }
  });

  const entryPoints: string[] = [];

  for (const scenarioFolderName of buildConfig.scenarioFolderNames) {
    const entryPoint: string = path.resolve(`./lib/${scenarioFolderName}/index.d.ts`);
    entryPoints.push(entryPoint);

    const overridesPath = path.resolve(`./src/${scenarioFolderName}/config/api-extractor-overrides.json`);
    const apiExtractorJsonOverrides = FileSystem.exists(overridesPath) ? JsonFile.load(overridesPath) : {};
    const apiExtractorJson = {
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

      newlineKind: 'os',

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
      },

      testMode: true,
      ...apiExtractorJsonOverrides
    };

    const apiExtractorJsonPath: string = `./temp/configs/api-extractor-${scenarioFolderName}.json`;

    JsonFile.save(apiExtractorJson, apiExtractorJsonPath, { ensureFolderExists: true });
  }

  let compilerState: CompilerState | undefined = undefined;
  let anyErrors: boolean = false;
  process.exitCode = 1;

  for (const scenarioFolderName of buildConfig.scenarioFolderNames) {
    console.log('Scenario: ' + scenarioFolderName);

    // Run the API Extractor programmatically
    const apiExtractorJsonPath: string = `./temp/configs/api-extractor-${scenarioFolderName}.json`;
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
  }

  if (!anyErrors) {
    process.exitCode = 0;
  }
}

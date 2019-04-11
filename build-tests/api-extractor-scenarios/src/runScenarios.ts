// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { JsonFile } from '@microsoft/node-core-library';
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

  const entryPoints: string[] = [];

  // TODO: Eliminate this workaround
  // See GitHub issue https://github.com/Microsoft/web-build-tools/issues/1017
  for (const scenarioFolderName of buildConfig.scenarioFolderNames) {
    const entryPoint: string = path.resolve(`./lib/${scenarioFolderName}/index.d.ts`);
    entryPoints.push(entryPoint);

    const apiExtractorJson = {
      '$schema': 'https://developer.microsoft.com/json-schemas/api-extractor/v7/api-extractor.schema.json',

      'mainEntryPointFile': entryPoint,

      'apiReport': {
        'enabled': true,
        'reportFolder': `<projectFolder>/etc/test-outputs/${scenarioFolderName}`
      },

      'dtsRollup': {
        'enabled': true,
        'untrimmedFilePath': `<projectFolder>/etc/test-outputs/${scenarioFolderName}/rollup.d.ts`
      },

      'docModel': {
        'enabled': true,
        'apiJsonFilePath': `<projectFolder>/etc/test-outputs/${scenarioFolderName}/<unscopedPackageName>.api.json`
      },

      'messages': {
        'extractorMessageReporting': {
          // For test purposes, write these warnings into .api.md
          // TODO: Capture the full list of warnings in the tracked test output file
          'ae-cyclic-inherit-doc': {
            'logLevel': 'warning',
            'addToApiReportFile': true
          },
          'ae-unresolved-link': {
            'logLevel': 'warning',
            'addToApiReportFile': true
          }
        }
      },

      'testMode': true
    };

    const apiExtractorJsonPath: string = `./temp/configs/api-extractor-${scenarioFolderName}.json`;

    JsonFile.save(apiExtractorJson, apiExtractorJsonPath, { ensureFolderExists: true });
  }

  let compilerState: CompilerState | undefined = undefined;
  let anyErrors: boolean = false;
  process.exitCode = 1;

  for (const scenarioFolderName of buildConfig.scenarioFolderNames) {
    const apiExtractorJsonPath: string = `./temp/configs/api-extractor-${scenarioFolderName}.json`;

    console.log('Scenario: ' + scenarioFolderName);

    // Run the API Extractor command-line
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
        if (message.messageId === ConsoleMessageId.ApiReportCreated) {
          // This script deletes the outputs for a clean build, so don't issue a warning if the file gets created
          message.logLevel = ExtractorLogLevel.None;
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

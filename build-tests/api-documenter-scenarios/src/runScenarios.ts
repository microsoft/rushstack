// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import child_process = require('child_process');
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

    const apiExtractorOverridesPath = path.resolve(
      `./src/${scenarioFolderName}/config/api-extractor-overrides.json`
    );
    const apiExtractorJsonOverrides = FileSystem.exists(apiExtractorOverridesPath)
      ? JsonFile.load(apiExtractorOverridesPath)
      : {};
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

      testMode: true,
      ...apiExtractorJsonOverrides
    };

    const apiExtractorJsonPath: string = `./temp/configs/api-extractor-${scenarioFolderName}.json`;

    JsonFile.save(apiExtractorJson, apiExtractorJsonPath, { ensureFolderExists: true });
  }

  const apiDocumenterJsonPath: string = `./config/api-documenter.json`;

  let compilerState: CompilerState | undefined = undefined;
  let anyErrors: boolean = false;
  process.exitCode = 1;

  for (const scenarioFolderName of buildConfig.scenarioFolderNames) {
    console.log('Scenario: ' + scenarioFolderName);

    // Run the API Extractor programmtically
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

    // API Documenter will always look for a config file in the same place (it cannot be configured), so this script
    // manually overwrites the API documenter config for each scenario. This is in contrast to the separate config files
    // created when invoking API Extractor above.
    const apiDocumenterOverridesPath = path.resolve(
      `./src/${scenarioFolderName}/config/api-documenter-overrides.json`
    );
    const apiDocumenterJsonOverrides = FileSystem.exists(apiDocumenterOverridesPath)
      ? JsonFile.load(apiDocumenterOverridesPath)
      : {};
    const apiDocumenterJson = {
      $schema: 'https://developer.microsoft.com/json-schemas/api-extractor/v7/api-documenter.schema.json',
      outputTarget: 'markdown',
      tableOfContents: {},
      ...apiDocumenterJsonOverrides
    };

    JsonFile.save(apiDocumenterJson, apiDocumenterJsonPath, { ensureFolderExists: true });

    // Run the API Documenter command-line
    executeCommand(
      'node node_modules/@microsoft/api-documenter/lib/start ' +
        `generate --input-folder etc/${scenarioFolderName} --output-folder etc/${scenarioFolderName}/markdown`
    );
  }

  // Delete the transient `api-documenter.json` file before completing, as it'll just be whatever the last scenario
  // was, and shouldn't be committed.
  FileSystem.deleteFile(apiDocumenterJsonPath);

  if (!anyErrors) {
    process.exitCode = 0;
  }
}

function executeCommand(command) {
  console.log('---> ' + command);
  child_process.execSync(command, { stdio: 'inherit' });
}

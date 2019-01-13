// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as process from 'process';
import { JsonFile, Executable, FileSystem } from '@microsoft/node-core-library';

function executeCommand(command: string, args: string[]): void {
  console.log(`---> ${command} ${args.join(' ')}`);

  // Redirect STDERR --> STDOUT since we don't want this warning to break the Rush build:
  // "You have changed the public API signature for this project"
  //
  // TODO: Remove this after the "Create an empty file" workaround below is removed
  const result = Executable.spawnSync(command, args, { stdio: [ 0, 1, 1 ] });

  if (result.error) {
    throw result.error.toString();
  }

  if (result.status !== 0) {
    throw new Error('The process returned a nonzero exit code');
  }
}

export function runScenarios(buildConfigPath: string): void {
  const buildConfig = JsonFile.load(buildConfigPath);

  const apiExtractorBinary = 'node_modules/.bin/api-extractor';

  // TODO: Eliminate this workaround
  // See GitHub issue https://github.com/Microsoft/web-build-tools/issues/1017
  for (const scenarioFolderName of buildConfig.scenarioFolderNames) {
    const apiExtractorJson =
    {
      "$schema": "https://developer.microsoft.com/json-schemas/api-extractor/api-extractor.schema.json",
      "compiler" : {
        "configType": "tsconfig",
        "rootFolder": "."
      },

      "apiReviewFile": {
        "enabled": true,
        "apiReviewFolder": `./etc/test-outputs/${scenarioFolderName}`,
        "tempFolder": "./temp"
      },

      "apiJsonFile": {
        "enabled": true,
        "outputFolder": `./etc/test-outputs/${scenarioFolderName}`
      },

      "dtsRollup": {
        "enabled": true,
        "trimming": false,

        "publishFolder": ".",

        "publishFolderForInternal": ".",
        "publishFolderForBeta": ".",
        "publishFolderForPublic": ".",

        "mainDtsRollupPath": `./etc/test-outputs/${scenarioFolderName}/rollup.d.ts`
      },

      "project": {
        "entryPointSourceFile": `./lib/${scenarioFolderName}/index.d.ts`
      }
    };

    const apiExtractorJsonPath: string = `./temp/configs/api-extractor-${scenarioFolderName}.json`;

    JsonFile.save(apiExtractorJson, apiExtractorJsonPath, { ensureFolderExists: true });

    // Create an empty file to force API Extractor to create a missing output file
    // TODO: Add an api-extractor option to force creation of a missing .api.ts file
    // See GitHub issue https://github.com/Microsoft/web-build-tools/issues/1018
    FileSystem.writeFile(`./etc/test-outputs/${scenarioFolderName}/api-extractor-scenarios.api.ts`, '',
      { ensureFolderExists: true });

    // Run the API Extractor command-line
    if (process.argv.indexOf('--production') >= 0) {
      executeCommand(apiExtractorBinary, ['run', '--config', apiExtractorJsonPath]);
    } else {
      executeCommand(apiExtractorBinary, ['run', '--local', '--config', apiExtractorJsonPath]);
    }

  }
}

// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as process from 'process';
import { FileSystem, JsonFile, Executable } from '@microsoft/node-core-library';

function executeCommand(command: string, args: string[]): void {
  console.log(`---> ${command} ${args.join(' ')}`);

  const result = Executable.spawnSync(command, args, { stdio: 'inherit' });

  if (result.error) {
    throw result.error.toString();
  }
}

export function runScenarios(buildConfigPath: string): void {
  const buildConfig = JsonFile.load(buildConfigPath);

  // const apiExtractorBinary = 'node_modules/@microsoft/api-extractor/lib/start';
  const apiExtractorBinary = 'node_modules/.bin/api-extractor';

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

    // Run the API Extractor command-line
    if (process.argv.indexOf('--production') >= 0) {
      executeCommand(apiExtractorBinary, ['run', '--config', apiExtractorJsonPath]);
    } else {
      // Create an empty file to force API Extractor to copy the output file
      JsonFile.save('', `etc/test-outputs/${scenarioFolderName}/api-extractor-scenarios.api.ts`,
        { ensureFolderExists: true });

      executeCommand(apiExtractorBinary, ['run', '--local', '--config', apiExtractorJsonPath]);
    }

  }
}

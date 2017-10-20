// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// NOTE: THIS SOURCE FILE IS FOR DEBUGGING PURPOSES ONLY.
//       IT IS INVOKED BY THE "Run.cmd" AND "Debug.cmd" BATCH FILES.

import { Extractor } from './extractor/Extractor';

const extractor: Extractor = new Extractor(
  {
    compiler: {
      configType: 'tsconfig',
      rootFolder: '.'
    },
    project: {
      entryPointSourceFile: 'src/index.ts',
      externalJsonFileFolders: ['./testInputs/external-api-json' ]
    },
    apiReviewFile: {
      enabled: true,
      apiReviewFolder: __dirname
    },
    apiJsonFile: {
      enabled: true
    }
  }
);

extractor.analyzeProject();

console.log('DebugRun completed.');

// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// NOTE: THIS SOURCE FILE IS FOR DEBUGGING PURPOSES ONLY.
//       IT IS INVOKED BY THE "Run.cmd" AND "Debug.cmd" BATCH FILES.

import * as os from 'os';
import { ApiExtractor } from './extractor/ApiExtractor';

const apiExtractor: ApiExtractor = new ApiExtractor({
  compiler: {
    configType: 'tsconfig',
    rootFolder: '.'
  },
  customErrorHandler: (message: string, fileName: string, lineNumber: number): void => {
    console.log(`ErrorHandler: ${message}` + os.EOL
      + `  ${fileName}#${lineNumber}`);
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
});

apiExtractor.analyzeProject();

console.log('DebugRun completed.');

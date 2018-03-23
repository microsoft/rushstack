// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// NOTE: THIS SOURCE FILE IS FOR DEBUGGING PURPOSES ONLY.
//       IT IS INVOKED BY THE 'Run.cmd' AND 'Debug.cmd' BATCH FILES.

import { Extractor } from './extractor/Extractor';
import * as path from 'path';

const extractor: Extractor = new Extractor(
  {
    compiler: {
      configType: 'tsconfig',
      overrideTsconfig: {
        'compilerOptions': {
          'target': 'es6',
          'forceConsistentCasingInFileNames': true,
          'module': 'commonjs',
          'declaration': true,
          'sourceMap': true,
          'experimentalDecorators': true,
          'types': [
            'node'
          ],
          'lib': [
            'es5',
            'scripthost',
            'es2015.collection',
            'es2015.promise',
            'es2015.iterable',
            'dom'
          ],
          'strictNullChecks': true
        },
        'include': [ 'lib/**/*.d.ts' ]
      },
      rootFolder: '../../libraries/node-core-library'
    },
    project: {
      entryPointSourceFile: 'lib/index.d.ts',
      externalJsonFileFolders: [ ]
    },
    apiReviewFile: {
      enabled: false,
      apiReviewFolder: path.join(__dirname, 'debug')
    },
    apiJsonFile: {
      enabled: true,
      outputFolder: path.join(__dirname, 'debug')
    },
    dtsRollup: {
      enabled: true,
      outputFolder: path.join(__dirname, 'debug')
    }
  }
);

console.log('CONFIG:' + JSON.stringify(extractor.actualConfig, undefined, '  '));

if (!extractor.processProject()) {
  console.log('processProject() failed the build');
} else {
  console.log('processProject() succeeded');
}

console.log('DebugRun completed.');

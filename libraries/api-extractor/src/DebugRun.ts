// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// NOTE: THIS SOURCE FILE IS FOR DEBUGGING PURPOSES ONLY.
//       IT IS INVOKED BY THE "Run.cmd" AND "Debug.cmd" BATCH FILES.

import * as ts from 'typescript';
import * as path from 'path';
import * as os from 'os';
import Extractor from './Extractor';
import ApiFileGenerator from './generators/ApiFileGenerator';
import ApiJsonGenerator from './generators/ApiJsonGenerator';

const ROOT_DIR: string = './test/inputs/example4';
const ENTRY_POINT: string = 'src/index.ts';

const compilerOptions: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES5,
  module: ts.ModuleKind.CommonJS,
  moduleResolution: ts.ModuleResolutionKind.NodeJs,
  experimentalDecorators: true,
  jsx: ts.JsxEmit.React,
  rootDir: ROOT_DIR,
  types: [ 'es6-collections', 'webpack-env' ]
};

const extractor: Extractor = new Extractor( {
  compilerOptions: compilerOptions,
  errorHandler:
    (message: string, fileName: string, lineNumber: number): void => {
      console.log(`ErrorHandler: ${message}` + os.EOL
        + `  ${fileName}#${lineNumber}`);
    }
});

extractor.loadExternalPackages('./testInputs/external-api-json');

process.chdir(ROOT_DIR);

extractor.analyze(
  {
    entryPointFile: path.join(ROOT_DIR, ENTRY_POINT),
    otherFiles: [
      path.join(ROOT_DIR, './typings/tsd.d.ts')
    ]
  }
);

// Normally warnings are kept by the ApiItem data structure,
// and written to the '*.api.ts' file.
const warnings: string[] = [];

const apiFileGenerator: ApiFileGenerator = new ApiFileGenerator();
apiFileGenerator.writeApiFile(path.join(__dirname, './DebugRun-Output.api.ts'), extractor);

const apiJsonGenerator: ApiJsonGenerator = new ApiJsonGenerator();
apiJsonGenerator.writeJsonFile(path.join(__dirname, './DebugRun-Output.json'), extractor);

console.log('DebugRun completed.');

// NOTE: THIS SOURCE FILE IS FOR DEBUGGING PURPOSES ONLY.
//       IT IS INVOKED BY THE "Run.cmd" AND "Debug.cmd" BATCH FILES.

import * as ts from 'typescript';
import * as path from 'path';
import Extractor from './Extractor';
import ApiFileGenerator from './generators/ApiFileGenerator';

const inputFolder: string = './testInputs/example1';
const outputFile: string = './lib/example1-output.ts';

const compilerOptions: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES5,
  module: ts.ModuleKind.CommonJS,
  moduleResolution: ts.ModuleResolutionKind.NodeJs,
  rootDir: inputFolder
};
const extractor: Extractor = new Extractor({
  compilerOptions: compilerOptions,
  errorHandler: console.log
});

extractor.analyze({
entryPointFile: path.join(inputFolder, 'index.ts')
});

const apiFileGenerator: ApiFileGenerator = new ApiFileGenerator();
apiFileGenerator.writeApiFile(outputFile, extractor);

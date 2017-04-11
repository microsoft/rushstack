// NOTE: THIS SOURCE FILE IS FOR DEBUGGING PURPOSES ONLY.
//       IT IS INVOKED BY THE "Run.cmd" AND "Debug.cmd" BATCH FILES.

import * as ts from 'typescript';
import * as os from 'os';
import Extractor from './Extractor';
import ApiFileGenerator from './generators/ApiFileGenerator';
import ApiJsonGenerator from './generators/ApiJsonGenerator';
import ApiDefinitionReference, { IApiDefinintionReferenceParts } from './ApiDefinitionReference';

const compilerOptions: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES5,
  module: ts.ModuleKind.CommonJS,
  moduleResolution: ts.ModuleResolutionKind.NodeJs,
  experimentalDecorators: true,
  jsx: ts.JsxEmit.React,
  rootDir: './testInputs/example2',
  typeRoots: ['./'] // We need to ignore @types in these tests
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

extractor.analyze({entryPointFile: './testInputs/example2/src/index.ts',
  otherFiles: []});

const externalPackageApiRef: IApiDefinintionReferenceParts = {
  scopeName: '',
  packageName: 'es6-collections',
  exportName: '',
  memberName: ''
};

// Normally warnings are kept by the ApiItem data structure,
// and written to the '*.api.ts' file.
const warnings: string[] = [];

const apiDefinitionRef: ApiDefinitionReference = ApiDefinitionReference.createFromParts(externalPackageApiRef);
console.log(extractor.docItemLoader.getPackage(apiDefinitionRef, warnings));

const apiFileGenerator: ApiFileGenerator = new ApiFileGenerator();
apiFileGenerator.writeApiFile('./lib/DebugRun.api.ts', extractor);

const apiJsonGenerator: ApiJsonGenerator = new ApiJsonGenerator();
apiJsonGenerator.writeJsonFile('./lib/DebugRun.json', extractor);

console.log('DebugRun completed.');

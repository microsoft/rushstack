// NOTE: THIS SOURCE FILE IS FOR DEBUGGING PURPOSES ONLY.
//       IT IS INVOKED BY THE "Run.cmd" AND "Debug.cmd" BATCH FILES.

import * as ts from 'typescript';
import * as os from 'os';
import * as path from 'path';
import Extractor from './Extractor';
import ApiFileGenerator from './generators/ApiFileGenerator';
import ApiJsonGenerator from './generators/ApiJsonGenerator';
import { IApiDefinitionReference } from './IApiDefinitionReference';

const compilerOptions: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES5,
  module: ts.ModuleKind.CommonJS,
  moduleResolution: ts.ModuleResolutionKind.NodeJs,
  experimentalDecorators: true,
  jsx: ts.JsxEmit.React,
  rootDir: './testInputs/example2'
};

const extractor: Extractor = new Extractor( {
  compilerOptions: compilerOptions,
  errorHandler:
    (message: string, fileName: string, lineNumber: number): void => {
      console.log(`ErrorHandler: ${message}` + os.EOL
        + `  ${fileName}#${lineNumber}`);
    }
});

extractor.loadExternalPackages(path.join(__dirname, '/external-api-json'));

extractor.analyze({entryPointFile: './testInputs/example2/index.ts',
  otherFiles: []});

const externalPackageApiRef: IApiDefinitionReference = {
  scopeName: '',
  packageName: 'es6-collections',
  exportName: '',
  memberName: ''
};
console.log(extractor.docItemLoader.getPackage(externalPackageApiRef));

const apiFileGenerator: ApiFileGenerator = new ApiFileGenerator();
apiFileGenerator.writeApiFile('./lib/DebugRun.api.ts', extractor);

const apiJsonGenerator: ApiJsonGenerator = new ApiJsonGenerator();
apiJsonGenerator.writeJsonFile('./lib/DebugRun.json', extractor);

console.log('DebugRun completed.');

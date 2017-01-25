// NOTE: THIS SOURCE FILE IS FOR DEBUGGING PURPOSES ONLY.
//       IT IS INVOKED BY THE "Run.cmd" AND "Debug.cmd" BATCH FILES.

import * as ts from 'typescript';
import * as os from 'os';
import Analyzer from './Analyzer';
import ApiFileGenerator from './generators/ApiFileGenerator';
import ApiJsonGenerator from './generators/ApiJsonGenerator';

const analyzer: Analyzer = new Analyzer(
  (message: string, fileName: string, lineNumber: number): void => {
    console.log(`ErrorHandler: ${message}` + os.EOL
      + `  ${fileName}#${lineNumber}`);
  }
);

/**
 * Debugging inheritdoc expression parser.
 * Analyzer on example2 is needed for testing the parser.
 */
analyzer.analyze({
  compilerOptions: {
    target: ts.ScriptTarget.ES5,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    experimentalDecorators: true,
    jsx: ts.JsxEmit.React,
    rootDir: './testInputs/example2' // 'D:/GitRepos/sp-client/spfx-core/sp-codepart-base'
  },
  entryPointFile: './testInputs/example2/index.ts', // 'D:/GitRepos/sp-client/spfx-core/sp-codepart-base/src/index.ts',
  otherFiles: []
});

const apiFileGenerator: ApiFileGenerator = new ApiFileGenerator();
apiFileGenerator.writeApiFile('./lib/DebugRun.api.ts', analyzer);

const apiJsonGenerator: ApiJsonGenerator = new ApiJsonGenerator();
apiJsonGenerator.writeJsonFile('./lib/DebugRun.json', analyzer);

console.log('DebugRun completed.');

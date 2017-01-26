/// <reference types="mocha" />

import * as ts from 'typescript';
import * as path from 'path';
import Extractor from '../../Extractor';
import ApiJsonGenerator from '../../generators/ApiJsonGenerator';
import TestFileComparer from '../../TestFileComparer';
/* tslint:disable:no-function-expression - Mocha uses a poorly scoped "this" pointer */

const capturedErrors: {
  message: string;
  fileName: string;
  lineNumber: number;
}[] = [];

function testErrorHandler(message: string, fileName: string, lineNumber: number): void {
  capturedErrors.push({ message, fileName, lineNumber });
}

describe('ApiJsonGenerator tests', function (): void {
  this.timeout(10000);

  describe('Basic Tests', function (): void {
    it('Example 1', function (): void {
      const inputFolder: string = './testInputs/example2';
      const outputFile: string = './lib/example2-output.json';
      const expectedFile: string = path.join(inputFolder, 'example2-output.json');

      const compilerOptions: ts.CompilerOptions = {
        target: ts.ScriptTarget.ES5,
        module: ts.ModuleKind.CommonJS,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
        rootDir: inputFolder
      };
      const extractor: Extractor = new Extractor({
        compilerOptions: compilerOptions,
        errorHandler: testErrorHandler
      });

      // This file is in lib/generators/tests/, we need to be in /lib
      extractor.loadExternalPackages(path.join(__dirname, '/../../external-api-json'));
      extractor.analyze({
        entryPointFile: path.join(inputFolder, 'index.ts')
      });

      const apiJsonGenerator: ApiJsonGenerator = new ApiJsonGenerator();
      apiJsonGenerator.writeJsonFile(outputFile, extractor);

      TestFileComparer.assertFileMatchesExpected(outputFile, expectedFile);
    });
  });
});

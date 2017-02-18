/// <reference types="mocha" />

import { assert } from 'chai';
import * as ts from 'typescript';
import * as path from 'path';
import Extractor from '../Extractor';
import TestFileComparer from '../TestFileComparer';
import ApiJsonGenerator from '../generators/ApiJsonGenerator';
/* tslint:disable:no-function-expression - Mocha uses a poorly scoped "this" pointer */

const capturedErrors: {
  message: string;
  fileName: string;
  lineNumber: number;
}[] = [];

function testErrorHandler(message: string, fileName: string, lineNumber: number): void {
  capturedErrors.push({ message, fileName, lineNumber });
}

describe('DocItemLoader tests', function (): void {
  this.timeout(10000);

  describe('Basic Tests', function (): void {
        it('Example 3', function (): void {
      const inputFolder: string = './testInputs/example3';
      const outputFile: string = './lib/example3-output.json';
      const expectedFile: string = path.join(inputFolder, 'example3-output.json');

      const compilerOptions: ts.CompilerOptions = {
        target: ts.ScriptTarget.ES5,
        module: ts.ModuleKind.CommonJS,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
        rootDir: inputFolder,
        typeRoots: ['./'] // We need to ignore @types in these tests
      };
      const extractor: Extractor = new Extractor({
        compilerOptions: compilerOptions,
        errorHandler: testErrorHandler
      });

      extractor.loadExternalPackages('./testInputs/external-api-json');
      extractor.analyze({
        entryPointFile: path.join(inputFolder, 'index.ts')
      });

      const apiJsonGenerator: ApiJsonGenerator = new ApiJsonGenerator();
      apiJsonGenerator.writeJsonFile(outputFile, extractor);

      assert.equal(capturedErrors.length, 3);
      assert.equal(capturedErrors[0].message, 'Unable to find referenced member \"MyClass.methodWithTwoParams\"');
      assert.equal(capturedErrors[1].message, 'circular reference');
      assert.equal(capturedErrors[2].message, 'Unable to link to "Internal" API item');
      TestFileComparer.assertFileMatchesExpected(outputFile, expectedFile);
    });
  });
});

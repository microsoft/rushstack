// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/// <reference types="mocha" />

import { assert } from 'chai';
import * as ts from 'typescript';
import * as path from 'path';
import Extractor from '../Extractor';
import TestFileComparer from '../TestFileComparer';
import ApiJsonGenerator from '../generators/ApiJsonGenerator';
import ApiFileGenerator from '../generators/ApiFileGenerator';
/* tslint:disable:no-function-expression - Mocha uses a poorly scoped "this" pointer */

const capturedErrors: {
  message: string;
  fileName: string;
  lineNumber: number;
}[] = [];

function testErrorHandler(message: string, fileName: string, lineNumber: number): void {
  capturedErrors.push({ message, fileName, lineNumber });
}

function assertCapturedErrors(expectedMessages: string[]): void {
  assert.deepEqual(capturedErrors.map(x => x.message), expectedMessages,
    'The captured errors did not match the expected output.');
}

// These warnings would normally be printed at the bottom
// of the source package's '*.api.ts' file.
const warnings: string[] = [];

describe('DocItemLoader tests', function (): void {
  this.timeout(10000);

  describe('Basic Tests', function (): void {
    it('Example 3', function (): void {
      const inputFolder: string = './testInputs/example3';
      const outputJsonFile: string = './lib/example3-output.json';
      const outputApiFile: string = './lib/example3-output.api.ts';
      const expectedJsonFile: string = path.join(inputFolder, 'example3-output.json');
      const expectedApiFile: string = path.join(inputFolder, 'example3-output.api.ts');

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
        entryPointFile: './testInputs/example3/src/index.ts'
      });

      const apiJsonGenerator: ApiJsonGenerator = new ApiJsonGenerator();
      apiJsonGenerator.writeJsonFile(outputJsonFile, extractor);

      // This is one error whose output is only visible in the form
      // of a 'warning' message in the 'example3-output.api.ts' file.
      // 'Unable to find referenced member \"MyClass.methodWithTwoParams\"' is the message
      // that should appear.
      const apiFileGenerator: ApiFileGenerator = new ApiFileGenerator();
      apiFileGenerator.writeApiFile(outputApiFile, extractor);

      assertCapturedErrors([
        'circular reference',
        'The {@link} tag references an @internal or @alpha API item,'
          + ' which will not appear in the generated documentation'
      ]);
      TestFileComparer.assertFileMatchesExpected(outputJsonFile, expectedJsonFile);
      TestFileComparer.assertFileMatchesExpected(outputApiFile, expectedApiFile);
    });
  });
});

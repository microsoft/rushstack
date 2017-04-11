/// <reference types="mocha" />

import { assert } from 'chai';
import * as ts from 'typescript';
import * as path from 'path';
import Extractor from '../../Extractor';
import ApiStructuredType from '../ApiStructuredType';
import ApiDocumentation, { ApiTag } from '../ApiDocumentation';

/* tslint:disable:no-function-expression - Mocha uses a poorly scoped "this" pointer */

const capturedErrors: {
  message: string;
  fileName: string;
  lineNumber: number;
}[] = [];

function testErrorHandler(message: string, fileName: string, lineNumber: number): void {
  capturedErrors.push({ message, fileName, lineNumber });
}

const inputFolder: string = './testInputs/example2';
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
// Run the analyzer once to be used by unit tests
extractor.analyze({
  entryPointFile: path.join(inputFolder, 'src/index.ts')
});

// These warnings would normally be printed at the bottom 
// of the source package's '*.api.ts' file.
const warnings: string[] = [];

const myDocumentedClass: ApiStructuredType = extractor.package.getSortedMemberItems()
.filter(apiItem => apiItem.name === 'MyDocumentedClass')[0] as ApiStructuredType;

describe('ApiDocumentation tests', function (): void {
  this.timeout(10000);

  describe('ApiDocumentation internal methods', function (): void {
    const apiDoc: ApiDocumentation = new ApiDocumentation(
      'Some summary\n@remarks and some remarks\n@public',
      extractor.docItemLoader,
      extractor,
      console.log,
      warnings
    );
  });

  describe('Documentation Parser Tests', function (): void {
    it('Should report errors', function (): void {
      /**
       * To view the expected errors see:
       * - testInputs/example2/folder/MyDocumentedClass (10  errors)
       */

      assert.equal(capturedErrors.length, 10);
      assert.equal(capturedErrors[0].message, 'Cannot provide summary in JsDoc if @inheritdoc tag is given');
      assert.equal(capturedErrors[1].message, 'The JSDoc tag "@summary" is not supported in this context');
      assert.equal(
        capturedErrors[2].message, 'Unexpected text in JSDoc comment: "Mock class for testing JsDoc parser"'
      );
      assert.equal(capturedErrors[3].message, 'Unknown JSDoc tag "@badJsDocTag"');
      assert.equal(capturedErrors[4].message, 'Unknown tag name for inline tag.');
      assert.equal(capturedErrors[5].message, 'Too few parameters for @link inline tag.');
      assert.equal(capturedErrors[6].message, 'Unexpected text in JSDoc comment: "can not contain a tag"');
      assert.equal(capturedErrors[7].message, 'More than one API Tag was specified');
      assert.equal(
        capturedErrors[8].message,
        'API reference expression must be of the form: \'scopeName/packageName:exportName.memberName ' +
        '| display text\'where the \'|\' is required if a display text is provided'
      );
      assert.equal(
        capturedErrors[9].message,
        'inheritdoc source item is deprecated. Must provide @deprecated message or remove @inheritdoc inline tag.');
  });

    it('Should parse API tag', function (): void {
      const expecedApiTag: ApiTag = ApiTag.Public;

      const actualDoc: ApiDocumentation = myDocumentedClass ? myDocumentedClass.documentation : undefined;

      assert.isObject(actualDoc);
      assert.equal(actualDoc.apiTag, expecedApiTag);
    });
  });
});

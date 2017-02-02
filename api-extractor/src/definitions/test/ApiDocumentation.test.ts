/// <reference types="mocha" />

import { assert } from 'chai';
import * as ts from 'typescript';
import * as path from 'path';
import Extractor from '../../Extractor';
import ApiStructuredType from '../ApiStructuredType';
import ApiDocumentation, { ApiTag } from '../ApiDocumentation';
import { IApiDefinitionReference } from '../../IApiDefinitionReference';

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
let myDocumentedClass: ApiStructuredType;

/**
 * Dummy class wrapping ApiDocumentation to test its protected methods
 */
class TestApiDocumentation extends ApiDocumentation {
  constructor() {
    super(myDocumentedClass, extractor.docItemLoader, extractor, console.log);
  }
}

extractor.loadExternalPackages('./testInputs/external-api-json');
// Run the analyzer once to be used by unit tests
extractor.analyze({
  entryPointFile: path.join(inputFolder, 'index.ts')
});

myDocumentedClass = extractor.package.getSortedMemberItems()
  .filter(apiItem => apiItem.name === 'MyDocumentedClass')[0] as ApiStructuredType;

describe('ApiDocumentation tests', function (): void {
  this.timeout(10000);

  describe('ApiDocumentation internal methods', function (): void {
    const apiDoc: TestApiDocumentation = new TestApiDocumentation();
    let apiReferenceExpr: string;
    let expected: IApiDefinitionReference;
    let actual: IApiDefinitionReference;

    it('_parseApiReferenceExpression() with scope name', function (): void {
      apiReferenceExpr = '@microsoft/sp-core-library:Guid';
      expected = {
        scopeName: '@microsoft',
        packageName: 'sp-core-library',
        exportName: 'Guid',
        memberName: ''
      };
      actual = ApiDocumentation.parseApiReferenceExpression(apiReferenceExpr, apiDoc.reportError);
      assert.equal(expected.scopeName, actual.scopeName);
      assert.equal(expected.packageName, actual.packageName);
      assert.equal(expected.exportName, actual.exportName);
      assert.equal(expected.memberName, actual.memberName);
    });

    it('_parseApiReferenceExpression() without scope name', function (): void {
      apiReferenceExpr = 'sp-core-library:Guid';
      expected = {scopeName: '', packageName: 'sp-core-library', exportName: 'Guid', memberName: ''};
      actual = ApiDocumentation.parseApiReferenceExpression(apiReferenceExpr, apiDoc.reportError);
      assert.equal(expected.scopeName, actual.scopeName);
      assert.equal(expected.packageName, actual.packageName);
      assert.equal(expected.exportName, actual.exportName);
      assert.equal(expected.memberName, actual.memberName);
    });

    it('_parseApiReferenceExpression() without scope name and with member name', function (): void {
      apiReferenceExpr = 'sp-core-library:Guid.equals';
      expected = {scopeName: '', packageName: 'sp-core-library', exportName: 'Guid', memberName: 'equals'};
      actual = ApiDocumentation.parseApiReferenceExpression(apiReferenceExpr, apiDoc.reportError);
      assert.equal(expected.scopeName, actual.scopeName);
      assert.equal(expected.packageName, actual.packageName);
      assert.equal(expected.exportName, actual.exportName);
      assert.equal(expected.memberName, actual.memberName);
    });

    it('_parseApiReferenceExpression() without scope name and invalid memberName', function (): void {
      // (Error #6)
      apiReferenceExpr = 'sp-core-library:Guid:equals';
      let caughtError: boolean = false;
      try {
        actual = ApiDocumentation.parseApiReferenceExpression(apiReferenceExpr, apiDoc.reportError);
      } catch (error) {
        caughtError = true;
      }
      assert.equal(caughtError, true);
    });
  });

  describe('Documentation Parser Tests', function (): void {
    it('Should report errors', function (): void {
      /**
       * To view the expected errors see:
       * - testInputs/example2/folder/MyDocumentedClass (9 errors)
       * - the test in this file '_parseApiReferenceExpression() without scope name and invalid memberName' (1 error)
       */
      assert.equal(capturedErrors.length, 10);
    });

    it('Should parse API tag', function (): void {
      const expecedApiTag: ApiTag = ApiTag.Public;

      const actualDoc: ApiDocumentation = myDocumentedClass ? myDocumentedClass.documentation : undefined;

      assert.isObject(actualDoc);
      assert.equal(actualDoc.apiTag, expecedApiTag);
    });
  });
});

/// <reference types="mocha" />

import { assert } from 'chai';
import * as ts from 'typescript';
import * as path from 'path';
import Analyzer from '../../Analyzer';
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

const analyzer: Analyzer = new Analyzer(testErrorHandler);
const inputFolder: string = './testInputs/example2';
let myDocumentedClass: ApiStructuredType;

/**
 * Dummy class wrapping ApiDocumentation to test its protected methods
 */
class TestApiDocumentation extends ApiDocumentation {
  constructor() {
    super(myDocumentedClass, analyzer.docItemLoader, (msg: string) => { return; });
  }

  public tokenizeDocs(docs: string): string[] {
    return this._tokenizeDocs(docs);
  }

  public parseDocsBlock(tokens: string[], startingIndex: number, tagName?: string): string {
    return this._parseDocsBlock(tokens, startingIndex, tagName);
  }

  public parseDocsInline(token: string): string {
    return this._parseDocsInline(token);
  }

  public parseApiReferenceExpression(apiReferenceExpression: string): IApiDefinitionReference {
    return this._parseApiReferenceExpression(apiReferenceExpression);
  }
}

// Run the analyzer once to be used by unit tests
analyzer.analyze({
  compilerOptions: {
    target: ts.ScriptTarget.ES5,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    rootDir: inputFolder
  },
  entryPointFile: path.join(inputFolder, 'index.ts')
});

myDocumentedClass = analyzer.package.getSortedMemberItems()
  .filter(apiItem => apiItem.name === 'MyDocumentedClass')[0] as ApiStructuredType;

describe('ApiDocumentation tests', function (): void {
  this.timeout(10000);

  describe('ApiDocumentation internal methods', function (): void {
    const apiDoc: TestApiDocumentation = new TestApiDocumentation();
    let apiReferenceExpr: string;
    let expected: IApiDefinitionReference;
    let actual: IApiDefinitionReference;

    it('_tokenizeDocs()', function (): void {
      const docs: string = `this is a mock documentation\n @taga hi\r\n @tagb hello @invalid@tag email@domain.com
        @tagc this is {   @inlineTag param1  param2   } and this is {just curly braces}`;
      const expectedTokens: string[] = [
        'this is a mock documentation',
        '@taga',
        'hi',
        '@tagb',
        'hello @invalid@tag email@domain.com',
        '@tagc',
        'this is',
        '{ @inlineTag param1 param2 }',
        'and this is {just curly braces}'
      ];

      assert.deepEqual(apiDoc.tokenizeDocs(docs), expectedTokens);
    });

    it('_parseDocsBlock()', function (): void {
      const tokens: string[] = [
        '@taga',
        'This',
        'block',
        'is merged as one',
        '@nexttag',
        'sometext'
      ];

      assert.equal(apiDoc.parseDocsBlock(tokens, 1), 'This block is merged as one');
    });

    it('_parseDocsInline()', function (): void {
      const token: string = '{    @link   https://bing.com   Bing  }';
      assert.equal(apiDoc.parseDocsInline(token), '{@link https://bing.com Bing}');
    });

    it('_parseApiReferenceExpression() with scope name', function (): void {
      apiReferenceExpr = '@microsoft/sp-core-library:Guid';
      expected = {
        scopeName: '@microsoft',
        packageName: 'sp-core-library',
        exportName: 'Guid',
        memberName: ''
      };
      actual = apiDoc.parseApiReferenceExpression(apiReferenceExpr);
      assert.equal(expected.scopeName, actual.scopeName);
      assert.equal(expected.packageName, actual.packageName);
      assert.equal(expected.exportName, actual.exportName);
      assert.equal(expected.memberName, actual.memberName);
    });

    it('_parseApiReferenceExpression() without scope name', function (): void {
      apiReferenceExpr = 'sp-core-library:Guid';
      expected = {scopeName: '', packageName: 'sp-core-library', exportName: 'Guid', memberName: ''};
      actual = apiDoc.parseApiReferenceExpression(apiReferenceExpr);
      assert.equal(expected.scopeName, actual.scopeName);
      assert.equal(expected.packageName, actual.packageName);
      assert.equal(expected.exportName, actual.exportName);
      assert.equal(expected.memberName, actual.memberName);
    });

    it('_parseApiReferenceExpression() without scope name and with member name', function (): void {
      apiReferenceExpr = 'sp-core-library:Guid.equals';
      expected = {scopeName: '', packageName: 'sp-core-library', exportName: 'Guid', memberName: 'equals'};
      actual = apiDoc.parseApiReferenceExpression(apiReferenceExpr);
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
        actual = apiDoc.parseApiReferenceExpression(apiReferenceExpr);
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
       * - testInputs/example2/folder/MyDocumentedClass (5 errors)
       * - the test in this file '_parseApiReferenceExpression() without scope name and invalid memberName' (1 error)
       */
      assert.equal(capturedErrors.length, 4);
    });

    it('Should parse API tag', function (): void {
      const expecedApiTag: ApiTag = ApiTag.Public;

      const actualDoc: ApiDocumentation = myDocumentedClass ? myDocumentedClass.documentation : undefined;

      assert.isObject(actualDoc);
      assert.equal(actualDoc.apiTag, expecedApiTag);
    });
  });
});

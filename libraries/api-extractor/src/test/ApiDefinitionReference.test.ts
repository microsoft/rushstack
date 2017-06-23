// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/// <reference types="mocha" />

import { assert } from 'chai';
import ApiDefinitionReference from '../ApiDefinitionReference';

/* tslint:disable:no-function-expression - Mocha uses a poorly scoped "this" pointer */
let capturedErrors: {
  message: string;
  fileName: string;
  lineNumber: number;
}[] = [];

function testErrorHandler(message: string, fileName: string, lineNumber: number): void {
  capturedErrors.push({ message, fileName, lineNumber });
}

function clearCapturedErrors(): void {
  capturedErrors = [];
}

function assertCapturedErrors(expectedMessages: string[]): void {
  assert.deepEqual(capturedErrors.map(x => x.message), expectedMessages,
    'The captured errors did not match the expected output.');
}

describe('ApiDocumentation tests', function (): void {
  this.timeout(10000);

  describe('ApiDocumentation internal methods', function (): void {
    let apiReferenceExpr: string;
    let actual: ApiDefinitionReference;

    it('_parseApiReferenceExpression() with scope name', function (): void {
      apiReferenceExpr = '@microsoft/sp-core-library:Guid';

      actual = ApiDefinitionReference.createFromString(apiReferenceExpr, console.log);
      assert.equal('@microsoft', actual.scopeName);
      assert.equal('sp-core-library', actual.packageName);
      assert.equal('Guid', actual.exportName);
      assert.equal('', actual.memberName);
    });

    it('_parseApiReferenceExpression() without scope name', function (): void {
      apiReferenceExpr = 'sp-core-library:Guid';

      actual = ApiDefinitionReference.createFromString(apiReferenceExpr, console.log);
      assert.equal('', actual.scopeName);
      assert.equal('sp-core-library', actual.packageName);
      assert.equal('Guid', actual.exportName);
      assert.equal('', actual.memberName);
    });

    it('_parseApiReferenceExpression() without scope name and with member name', function (): void {
      apiReferenceExpr = 'sp-core-library:Guid.equals';

      actual = ApiDefinitionReference.createFromString(apiReferenceExpr, console.log);
      assert.equal('', actual.scopeName);
      assert.equal('sp-core-library', actual.packageName);
      assert.equal('Guid', actual.exportName);
      assert.equal('equals', actual.memberName);
    });

    it('_parseApiReferenceExpression() without scope name and invalid memberName', function (): void {
      clearCapturedErrors();
      // This won't raise an error (based on our current decision to only show warnings in the *.api.ts
      // files if we can't find a reference)
      apiReferenceExpr = 'sp-core-library:Guid:equals';
      actual = ApiDefinitionReference.createFromString(apiReferenceExpr, console.log);
      assertCapturedErrors([]);
    });
  });
});
// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiDefinitionReference } from '../ApiDefinitionReference';

/* tslint:disable:no-function-expression - Mocha uses a poorly scoped "this" pointer */
let capturedErrors: {
  message: string;
  fileName: string;
  lineNumber: number;
}[] = [];

function clearCapturedErrors(): void {
  capturedErrors = [];
}

function assertCapturedErrors(expectedMessages: string[]): void {
  expect(capturedErrors.map(x => x.message)).toEqual(expectedMessages);
}

describe('ApiDocumentation tests', function (): void {
  describe('ApiDocumentation internal methods', function (): void {
    let apiReferenceExpr: string;
    let actual: ApiDefinitionReference | undefined;

    it('_parseApiReferenceExpression() with scope name', function (): void {
      apiReferenceExpr = '@microsoft/sp-core-library:Guid';

      actual = ApiDefinitionReference.createFromString(apiReferenceExpr, console.log);
      expect(actual!.scopeName).toBe('@microsoft');
      expect(actual!.packageName).toBe('sp-core-library');
      expect(actual!.exportName).toBe('Guid');
      expect(actual!.memberName).toBe('');
    });

    it('_parseApiReferenceExpression() without scope name', function (): void {
      apiReferenceExpr = 'sp-core-library:Guid';

      actual = ApiDefinitionReference.createFromString(apiReferenceExpr, console.log);
      expect(actual!.scopeName).toBe('');
      expect(actual!.packageName).toBe('sp-core-library');
      expect(actual!.exportName).toBe('Guid');
      expect(actual!.memberName).toBe('');
    });

    it('_parseApiReferenceExpression() without scope name and with member name', function (): void {
      apiReferenceExpr = 'sp-core-library:Guid.equals';

      actual = ApiDefinitionReference.createFromString(apiReferenceExpr, console.log);
      expect(actual!.scopeName).toBe('');
      expect(actual!.packageName).toBe('sp-core-library');
      expect(actual!.exportName).toBe('Guid');
      expect(actual!.memberName).toBe('equals');
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
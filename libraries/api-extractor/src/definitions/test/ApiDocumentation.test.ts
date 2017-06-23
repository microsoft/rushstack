// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/// <reference types="mocha" />

import { assert } from 'chai';
import * as ts from 'typescript';
import * as path from 'path';
import Extractor from '../../Extractor';
import ApiStructuredType from '../ApiStructuredType';
import ApiDocumentation, { ReleaseTag } from '../ApiDocumentation';

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

      assert.equal(capturedErrors.length, 8);
      assert.equal(capturedErrors[0].message, 'A summary block is not allowed here, because the @inheritdoc'
        + ' target provides the summary');
      assert.equal(capturedErrors[1].message, 'The JSDoc tag "@badAedocTag" is not supported by AEDoc');
      assert.equal(capturedErrors[2].message, 'Invalid call to _tokenizeInline()');
      assert.equal(capturedErrors[3].message, 'The {@link} tag must include a URL or API item reference');
      assert.equal(capturedErrors[4].message, 'Unexpected text in AEDoc comment: "can not contain a tag"');
      assert.equal(capturedErrors[5].message, 'More than one release tag (@alpha, @beta, etc) was specified');
      assert.equal(capturedErrors[6].message, 'An API item reference must use the notation:'
        + ' "@scopeName/packageName:exportName.memberName"'
      );
      assert.equal(capturedErrors[7].message, 'The @inheritdoc target has been marked as @deprecated.  '
        + 'Add a @deprecated message here, or else remove the @inheritdoc relationship.');
    });

    it('Should parse release tag', function (): void {
      const expectedReleaseTag: ReleaseTag = ReleaseTag.Public;

      const actualDoc: ApiDocumentation = myDocumentedClass ? myDocumentedClass.documentation : undefined;

      assert.isObject(actualDoc);
      assert.equal(actualDoc.releaseTag, expectedReleaseTag);
    });
  });
});

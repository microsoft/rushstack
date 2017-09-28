// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/// <reference types="mocha" />

import { assert } from 'chai';
import * as ts from 'typescript';
import * as path from 'path';
import { JsonFile } from '@microsoft/node-core-library';

import DocElementParser from '../DocElementParser';
import {
  IDocElement,
  IHrefLinkElement,
  ICodeLinkElement,
  ITextElement,
  ISeeDocElement
} from '../markup/OldMarkup';

import { IAedocParameter } from '../aedoc/ApiDocumentation';

import TestFileComparer from '../TestFileComparer';
import AstStructuredType from '../ast/AstStructuredType';
import ApiDocumentation from '../aedoc/ApiDocumentation';
import Extractor from '../Extractor';
import Tokenizer from '../aedoc/Tokenizer';

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

const inputFolder: string = './testInputs/example2';
let myDocumentedClass: AstStructuredType;

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

// These warnings would normally be printed at the bottom
// of the source package's '*.api.ts' file.
const warnings: string[] = [];

/**
 * Dummy class wrapping ApiDocumentation to test its protected methods
 */
class TestApiDocumentation extends ApiDocumentation {
  constructor() {
    super(
      'Some summary\n@remarks and some remarks\n@public',
      extractor.docItemLoader,
      extractor,
      console.log,
      warnings
    );
  }

  public parseParam(tokenizer: Tokenizer): IAedocParameter {
    return this._parseParam(tokenizer);
  }
}

extractor.loadExternalPackages('./testInputs/external-api-json');
// Run the analyze method once to be used by unit tests
extractor.analyze({
  entryPointFile: path.join(inputFolder, 'src/index.ts')
});

myDocumentedClass = extractor.package.getSortedMemberItems()
  .filter(astItem => astItem.name === 'MyDocumentedClass')[0] as AstStructuredType;

describe('DocElementParser tests', function (): void {
  this.timeout(10000);

  describe('Basic Tests', (): void => {
    it('Should parse basic doc comment stream', (): void => {
      clearCapturedErrors();
      const apiDoc: TestApiDocumentation = new TestApiDocumentation();

      const docs: string = 'This function parses docTokens for the apiLint website ' +
      '{@link https://github.com/OfficeDev/office-ui-fabric-react} \n' +
      '@returns an object \n' +
      '@param param1 - description of the type param1 \n' +
      '@param param2 - description of the type param2 \n' +
      '@internal';
      const tokenizer: Tokenizer = new Tokenizer(docs, console.log);

      // Testing Summary Doc Elements
      const expectedSummary: IDocElement[] = [
          {kind: 'textDocElement', value: 'This function parses docTokens for the apiLint website '} as ITextElement,
          {
              kind: 'linkDocElement',
              referenceType: 'href',
              targetUrl: 'https://github.com/OfficeDev/office-ui-fabric-react',
              value: 'https://github.com/OfficeDev/office-ui-fabric-react'
        } as IHrefLinkElement
      ];
      const actualSummary: IDocElement[] = DocElementParser.getTrimmedSpan(
        DocElementParser.parse(myDocumentedClass.documentation, tokenizer));
      JsonFile.save(expectedSummary, './lib/basicDocExpected.json');
      JsonFile.save(actualSummary, './lib/basicDocActual.json');
      TestFileComparer.assertFileMatchesExpected('./lib/basicDocActual.json', './lib/basicDocExpected.json');

      // Testing Returns Doc Elements
      const expectedReturn: IDocElement[] = [
          {kind: 'textDocElement', value: 'an object'} as ITextElement
      ];
      tokenizer.getToken();
      const actualReturn: IDocElement[] = DocElementParser.getTrimmedSpan(
        DocElementParser.parse(myDocumentedClass.documentation, tokenizer));
      JsonFile.save(expectedReturn, './lib/returnDocExpected.json');
      JsonFile.save(actualReturn, './lib/returnDocActual.json');
      TestFileComparer.assertFileMatchesExpected('./lib/returnDocActual.json', './lib/returnDocExpected.json');

      // Testing Params Doc Elements
      const expectedParam: IAedocParameter[] = [
          {
              name: 'param1',
              description: [{kind: 'textDocElement', value: 'description of the type param1'}]
          } as IAedocParameter,
          {
              name: 'param2',
              description: [{kind: 'textDocElement', value: 'description of the type param2'}]
          } as IAedocParameter
      ];
      const actualParam: IAedocParameter[] = [];
      tokenizer.getToken();
      actualParam.push(apiDoc.parseParam(tokenizer));
      tokenizer.getToken();
      actualParam.push(apiDoc.parseParam(tokenizer));

      JsonFile.save(expectedParam, './lib/paramDocExpected.json');
      JsonFile.save(actualParam, './lib/paramDocActual.json');
      TestFileComparer.assertFileMatchesExpected('./lib/paramDocActual.json', './lib/paramDocExpected.json');
      assertCapturedErrors([]);
    });

    it('Should parse @deprecated correctly', (): void => {
      clearCapturedErrors();
      const docs: string = '@deprecated - description of the deprecation';
      const tokenizer: Tokenizer = new Tokenizer(docs, console.log);

      // Testing Deprecated Doc Elements
      const expectedDeprecated: IDocElement[] = [
          {kind: 'textDocElement', value: '- description of the deprecation'} as ITextElement
      ];
      tokenizer.getToken();
      const actualDeprecated: IDocElement[] = DocElementParser.getTrimmedSpan(
        DocElementParser.parse(myDocumentedClass.documentation, tokenizer));
      JsonFile.save(expectedDeprecated, './lib/deprecatedDocExpected.json');
      JsonFile.save(actualDeprecated, './lib/deprecatedDocActual.json');
      TestFileComparer.assertFileMatchesExpected('./lib/deprecatedDocActual.json', './lib/deprecatedDocExpected.json');
      assertCapturedErrors([]);
    });

    it('Should parse @see with nested link and/or text', (): void => {
      clearCapturedErrors();
      const docs: string = 'Text describing the function’s purpose/nuances/context. \n' +
      '@see {@link https://github.com/OfficeDev/office-ui-fabric-react | The link will provide context}';
      const tokenizer: Tokenizer = new Tokenizer(docs, console.log);

      // Testing Summary Elements
      const expectedSummary: IDocElement[] = [
          {kind: 'textDocElement', value: 'Text describing the function’s purpose/nuances/context. '} as ITextElement,
          {
              kind: 'seeDocElement',
              seeElements: [
                  {
                      kind: 'linkDocElement',
                      referenceType: 'href',
                      targetUrl: 'https://github.com/OfficeDev/office-ui-fabric-react',
                      value: 'The link will provide context'
                  } as IHrefLinkElement
              ]
          } as ISeeDocElement
      ];
      const actualSummary: IDocElement[] = DocElementParser.getTrimmedSpan(
        DocElementParser.parse(myDocumentedClass.documentation, tokenizer));
      JsonFile.save(expectedSummary, './lib/seeDocExpected.json');
      JsonFile.save(actualSummary, './lib/seeDocActual.json');
      TestFileComparer.assertFileMatchesExpected('./lib/seeDocExpected.json', './lib/seeDocActual.json');
      assertCapturedErrors([]);
    });

    it('Should parse @param with nested link and/or text', (): void => {
      clearCapturedErrors();
      const apiDoc: TestApiDocumentation = new TestApiDocumentation();

      // Don't include the "@param" in the doc string, parseParam() expects this to be processed in a
      // previous step.
      const docs: string = 'x - The height in {@link http://wikipedia.org/pixel_units}';
      const tokenizer: Tokenizer = new Tokenizer(docs, console.log);

      // Testing Param Doc Elements
      const description: IDocElement[] = [
        {kind: 'textDocElement', value: 'The height in'} as ITextElement,
          {
              kind: 'linkDocElement',
              referenceType: 'href',
              targetUrl: 'http://wikipedia.org/pixel_units',
              value: 'http://wikipedia.org/pixel_units'
          } as IHrefLinkElement
      ];
      const expectedParam: IAedocParameter = {
          name: 'x',
          description: description
      } as IAedocParameter;
      const actualParam: IAedocParameter = apiDoc.parseParam(tokenizer);

      JsonFile.save(expectedParam, './lib/nestedParamDocExpected.json');
      JsonFile.save(actualParam, './lib/nestedParamDocActual.json');
      TestFileComparer.assertFileMatchesExpected(
        './lib/nestedParamDocActual.json',
        './lib/nestedParamDocExpected.json'
      );
      assertCapturedErrors([]);
    });

    it('Should parse @link with URL', (): void => {
      clearCapturedErrors();
      const docs: string = '{@link https://microsoft.com}';
      const tokenizer: Tokenizer = new Tokenizer(docs, console.log);

      let docElements: IDocElement[];
      /* tslint:disable-next-line:no-any */
      let errorMessage: any;
      try {
        docElements = DocElementParser.parse(myDocumentedClass.documentation, tokenizer);
      } catch (error) {
        errorMessage = error;
      }
      assert.isUndefined(errorMessage);

      const linkDocElement: IHrefLinkElement = (docElements[0] as IHrefLinkElement);
      assert.equal(linkDocElement.referenceType, 'href');
      assert.equal(linkDocElement.targetUrl, 'https://microsoft.com');
      assert.equal(linkDocElement.value, 'https://microsoft.com');
      assertCapturedErrors([]);
    });

    it('Should parse @link with URL and text', (): void => {
      clearCapturedErrors();
      const docs: string = '{@link https://microsoft.com | microsoft home}';
      const tokenizer: Tokenizer = new Tokenizer(docs, console.log);

      let docElements: IDocElement[];
      /* tslint:disable-next-line:no-any */
      let errorMessage: any;
      try {
        docElements = DocElementParser.parse(myDocumentedClass.documentation, tokenizer);
      } catch (error) {
        errorMessage = error;
      }
      assert.isUndefined(errorMessage);

      const linkDocElement: IHrefLinkElement = (docElements[0] as IHrefLinkElement);
      assert.equal(linkDocElement.referenceType, 'href');
      assert.equal(linkDocElement.targetUrl, 'https://microsoft.com');
      assert.equal(linkDocElement.value, 'microsoft home');
      assertCapturedErrors([]);
    });

    it('Should reject @link with missing pipe', (): void => {
      clearCapturedErrors();

      const docs: string = '{@link https://microsoft.com microsoft home}';
      const tokenizer: Tokenizer = new Tokenizer(docs, console.log);

      let docElements: IDocElement[];
      /* tslint:disable-next-line:no-any */
      let errorMessage: any;
      try {
        docElements = DocElementParser.parse(myDocumentedClass.documentation, tokenizer);
      } catch (error) {
        errorMessage = error;
      }
      assert.isUndefined(errorMessage);
      assertCapturedErrors(['The {@link} tag contains additional spaces after the URL; if the URL'
        +  ' contains spaces, encode them using %20; for display text, use a pipe delimiter ("|")']);
    });

    it('Should reject @link with bad display text character', (): void => {
      clearCapturedErrors();

      const docs: string = '{@link https://example.com | Ex@ample}';
      const tokenizer: Tokenizer = new Tokenizer(docs, console.log);

      let docElements: IDocElement[];
      /* tslint:disable-next-line:no-any */
      let errorMessage: any;
      try {
        docElements = DocElementParser.parse(myDocumentedClass.documentation, tokenizer);
      } catch (error) {
        errorMessage = error;
      }
      assert.isUndefined(errorMessage);
      assertCapturedErrors(['The {@link} tag\'s display text contains an unsupported character: "@"']);
    });

    it('Should parse @link with API definition reference', (): void => {
      clearCapturedErrors();
      const docs: string = '{@link @microsoft/sp-core-library:Guid.equals}';
      const tokenizer: Tokenizer = new Tokenizer(docs, console.log);

      let docElements: IDocElement[];
      /* tslint:disable-next-line:no-any */
      let errorMessage: any;
      try {
        docElements = DocElementParser.parse(myDocumentedClass.documentation, tokenizer);
      } catch (error) {
        errorMessage = error;
      }
      assert.isUndefined(errorMessage);

      const linkDocElement: ICodeLinkElement = (docElements[0] as ICodeLinkElement);
      assert.equal(linkDocElement.referenceType, 'code');
      assert.equal(linkDocElement.scopeName, '@microsoft');
      assert.equal(linkDocElement.packageName, 'sp-core-library');
      assert.equal(linkDocElement.exportName, 'Guid');
      assert.equal(linkDocElement.memberName, 'equals');
      assertCapturedErrors([]);
    });

    it('Should parse @link with API defintion reference and text', (): void => {
      clearCapturedErrors();
      const docs: string = '{@link @microsoft/sp-core-library:Guid.equals | Guid equals}';
      const tokenizer: Tokenizer = new Tokenizer(docs, console.log);

      let docElements: IDocElement[];
      /* tslint:disable-next-line:no-any */
      let errorMessage: any;
      try {
        docElements = DocElementParser.parse(myDocumentedClass.documentation, tokenizer);
      } catch (error) {
        errorMessage = error;
      }
      assert.isUndefined(errorMessage);

      const linkDocElement: ICodeLinkElement = (docElements[0] as ICodeLinkElement);
      assert.equal(linkDocElement.referenceType, 'code');
      assert.equal(linkDocElement.scopeName, '@microsoft');
      assert.equal(linkDocElement.packageName, 'sp-core-library');
      assert.equal(linkDocElement.exportName, 'Guid');
      assert.equal(linkDocElement.memberName, 'equals');
      assert.equal(linkDocElement.value, 'Guid equals');
      assertCapturedErrors([]);
    });

    it('Should report errors @link', (): void => {
      clearCapturedErrors();
      const docs: string = '{@link @microsoft/sp-core-library:Guid.equals | Guid equals | something}';
      const tokenizer: Tokenizer = new Tokenizer(docs, console.log);

      let docElements: IDocElement[];
      /* tslint:disable-next-line:no-any */
      let errorMessage: any;
      try {
        docElements = DocElementParser.parse(myDocumentedClass.documentation, tokenizer);
      } catch (error) {
        errorMessage = error;
      }
      assert.isNotNull(errorMessage);
      assertCapturedErrors(['The {@link} tag contains more than one pipe character ("|")']);
    });
  });
});

/// <reference types="mocha" />

import { assert } from 'chai';
import * as ts from 'typescript';
import * as path from 'path';
import DocElementParser from '../DocElementParser';
import { IDocElement, IParam, IHrefLinkElement, ICodeLinkElement, ITextElement, ISeeDocElement } from '../IDocElement';
import TestFileComparer from '../TestFileComparer';
import JsonFile from '../JsonFile';
import ApiStructuredType from '../definitions/ApiStructuredType';
import ApiDocumentation from '../definitions/ApiDocumentation';
import Extractor from './../Extractor';
import Tokenizer from './../Tokenizer';

const capturedErrors: {
  message: string;
  fileName: string;
  lineNumber: number;
}[] = [];

function testErrorHandler(message: string, fileName: string, lineNumber: number): void {
  capturedErrors.push({ message, fileName, lineNumber });
}

const inputFolder: string = './testInputs/example2';
let myDocumentedClass: ApiStructuredType;

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

/**
 * Dummy class wrapping ApiDocumentation to test its protected methods
 */
class TestApiDocumentation extends ApiDocumentation {
  constructor() {
    super(myDocumentedClass, extractor.docItemLoader, (msg: string) => { return; });
  }

  public parseParam(tokenizer: Tokenizer): IParam {
    return this._parseParam(tokenizer);
  }
}

extractor.loadExternalPackages('./testInputs/external-api-json');
// Run the analyze method once to be used by unit tests
extractor.analyze({
  entryPointFile: path.join(inputFolder, 'index.ts')
});

myDocumentedClass = extractor.package.getSortedMemberItems()
  .filter(apiItem => apiItem.name === 'MyDocumentedClass')[0] as ApiStructuredType;

describe('DocElementParser tests', function (): void {
  this.timeout(10000);

  describe('Basic Tests', (): void => {
    it('Should parse basic doc comment stream', (): void => {
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
          {kind: 'textDocElement', value: 'This function parses docTokens for the apiLint website'} as ITextElement,
          {
              kind: 'linkDocElement',
              referenceType: 'href',
              targetUrl: 'https://github.com/OfficeDev/office-ui-fabric-react',
              value: ''
        } as IHrefLinkElement
      ];
      const actualSummary: IDocElement[] = DocElementParser.parse(tokenizer, console.log);
      JsonFile.saveJsonFile('./lib/basicDocExpected.json', JSON.stringify(expectedSummary));
      JsonFile.saveJsonFile('./lib/basicDocActual.json', JSON.stringify(actualSummary));
      TestFileComparer.assertFileMatchesExpected('./lib/basicDocActual.json', './lib/basicDocExpected.json');

      // Testing Returns Doc Elements
      const expectedReturn: IDocElement[] = [
          {kind: 'textDocElement', value: 'an object'} as ITextElement
      ];
      tokenizer.getToken();
      const actualReturn: IDocElement[] = DocElementParser.parse(tokenizer, console.log);
      JsonFile.saveJsonFile('./lib/returnDocExpected.json', JSON.stringify(expectedReturn));
      JsonFile.saveJsonFile('./lib/returnDocActual.json', JSON.stringify(actualReturn));
      TestFileComparer.assertFileMatchesExpected('./lib/returnDocActual.json', './lib/returnDocExpected.json');

      // Testing Params Doc Elements
      const expectedParam: IParam[] = [
          {
              name: 'param1',
              description: [{kind: 'textDocElement', value: 'description of the type param1'}]
          } as IParam,
          {
              name: 'param2',
              description: [{kind: 'textDocElement', value: 'description of the type param2'}]
          } as IParam
      ];
      const actualParam: IParam[] = [];
      tokenizer.getToken();
      actualParam.push(apiDoc.parseParam(tokenizer));
      tokenizer.getToken();
      actualParam.push(apiDoc.parseParam(tokenizer));

      JsonFile.saveJsonFile('./lib/paramDocExpected.json', JSON.stringify(expectedParam));
      JsonFile.saveJsonFile('./lib/paramDocActual.json', JSON.stringify(actualParam));
      TestFileComparer.assertFileMatchesExpected('./lib/paramDocActual.json', './lib/paramDocExpected.json');
    });

    it('Should parse @deprecated correctly', (): void => {
      const docs: string = '@deprecated - description of the deprecation';
      const tokenizer: Tokenizer = new Tokenizer(docs, console.log);

      // Testing Deprecated Doc Elements
      const expectedDeprecated: IDocElement[] = [
          {kind: 'textDocElement', value: '- description of the deprecation'} as ITextElement
      ];
      tokenizer.getToken();
      const actualDeprecated: IDocElement[] = DocElementParser.parse(tokenizer, console.log);
      JsonFile.saveJsonFile('./lib/deprecatedDocExpected.json', JSON.stringify(expectedDeprecated));
      JsonFile.saveJsonFile('./lib/deprecatedDocActual.json', JSON.stringify(actualDeprecated));
      TestFileComparer.assertFileMatchesExpected('./lib/deprecatedDocActual.json', './lib/deprecatedDocExpected.json');
    });

    it('Should parse @see with nested link and/or text', (): void => {
      const docs: string = 'Text describing the function’s purpose/nuances/context. \n' +
      '@see {@link https://github.com/OfficeDev/office-ui-fabric-react | The link will provide context}';
      const tokenizer: Tokenizer = new Tokenizer(docs, console.log);

      // Testing Summary Elements
      const expectedSummary: IDocElement[] = [
          {kind: 'textDocElement', value: 'Text describing the function’s purpose/nuances/context.'} as ITextElement,
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
      const actualSummary: IDocElement[] = DocElementParser.parse(tokenizer, console.log);
      JsonFile.saveJsonFile('./lib/seeDocExpected.json', JSON.stringify(expectedSummary));
      JsonFile.saveJsonFile('./lib/seeDocActual.json', JSON.stringify(actualSummary));
      TestFileComparer.assertFileMatchesExpected('./lib/seeDocExpected.json', './lib/seeDocActual.json');
    });

    it('Should parse @param with nested link and/or text', (): void => {
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
              value: ''
          } as IHrefLinkElement
      ];
      const expectedParam: IParam = {
          name: 'x',
          description: description
      } as IParam;
      const actualParam: IParam = apiDoc.parseParam(tokenizer);

      JsonFile.saveJsonFile('./lib/nestedParamDocExpected.json', JSON.stringify(expectedParam));
      JsonFile.saveJsonFile('./lib/nestedParamDocActual.json', JSON.stringify(actualParam));
      TestFileComparer.assertFileMatchesExpected(
        './lib/nestedParamDocActual.json',
        './lib/nestedParamDocExpected.json'
      );
    });

    it('Should parse @link with url', (): void => {
      const docs: string = '{@link https://microsoft.com}';
      const tokenizer: Tokenizer = new Tokenizer(docs, console.log);

      let docElements: IDocElement[];
      /* tslint:disable-next-line:no-any */
      let errorMessage: any;
      try {
        docElements = DocElementParser.parse(tokenizer, console.log);
      } catch (error) {
        errorMessage = error;
      }
      assert.isUndefined(errorMessage);

      const linkDocElement: IHrefLinkElement = (docElements[0] as IHrefLinkElement);
      assert.equal(linkDocElement.referenceType, 'href');
      assert.equal(linkDocElement.targetUrl, 'https://microsoft.com');
      assert.equal(linkDocElement.value, '');
    });

    it('Should parse @link with url and text', (): void => {
     const docs: string = '{@link https://microsoft.com | microsoft home}';
     const tokenizer: Tokenizer = new Tokenizer(docs, console.log);

      let docElements: IDocElement[];
      /* tslint:disable-next-line:no-any */
      let errorMessage: any;
      try {
        docElements = DocElementParser.parse(tokenizer, console.log);
      } catch (error) {
        errorMessage = error;
      }
      assert.isUndefined(errorMessage);

      const linkDocElement: IHrefLinkElement = (docElements[0] as IHrefLinkElement);
      assert.equal(linkDocElement.referenceType, 'href');
      assert.equal(linkDocElement.targetUrl, 'https://microsoft.com');
      assert.equal(linkDocElement.value, 'microsoft home');
    });

    it('Should parse @link with API defintion reference', (): void => {
      const docs: string = '{@link @microsoft/sp-core-library:Guid.equals}';
      const tokenizer: Tokenizer = new Tokenizer(docs, console.log);

      let docElements: IDocElement[];
      /* tslint:disable-next-line:no-any */
      let errorMessage: any;
      try {
        docElements = DocElementParser.parse(tokenizer, console.log);
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
    });

    it('Should parse @link with API defintion reference and text', (): void => {
      const docs: string = '{@link @microsoft/sp-core-library:Guid.equals | Guid equals}';
      const tokenizer: Tokenizer = new Tokenizer(docs, console.log);

      let docElements: IDocElement[];
      /* tslint:disable-next-line:no-any */
      let errorMessage: any;
      try {
        docElements = DocElementParser.parse(tokenizer, console.log);
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
    });

    it('Should report errors @link', (): void => {
      const docs: string = '{@link @microsoft/sp-core-library:Guid.equals | Guid equals | something}';
      const tokenizer: Tokenizer = new Tokenizer(docs, console.log);

      let docElements: IDocElement[];
      /* tslint:disable-next-line:no-any */
      let errorMessage: any;
      try {
        docElements = DocElementParser.parse(tokenizer, console.log);
      } catch (error) {
        errorMessage = error;
      }
      assert.isNotNull(errorMessage);
    });
  });
});

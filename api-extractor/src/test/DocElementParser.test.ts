import * as ts from 'typescript';
import * as path from 'path';
import DocElementParser from '../DocElementParser';
import { IDocElement, IParam } from '../IDocElement';
import TestFileComparer from '../TestFileComparer';
import JsonFile from '../JsonFile';
import ApiStructuredType from '../definitions/ApiStructuredType';
import ApiDocumentation from '../definitions/ApiDocumentation';
import Analyzer from './../Analyzer';

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

  public parseParam(tokenStream: string[]): IParam {
    return this._parseParam(tokenStream);
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

describe('DocElementParser tests', function (): void {
  this.timeout(10000);

  describe('Basic Tests', (): void => {
    it('Should parse basic doc comment stream', (): void => {
      const apiDoc: TestApiDocumentation = new TestApiDocumentation();
      const tokenStream: string[] = [
          'This function parses docTokens for the apiExtractor website',
          '{@link https://github.com/OfficeDev/office-ui-fabric-react}',
          '@returns',
          'an object',
          '@param',
          'param1 - description of the type param1',
          '@param',
          'param2 - description of the type param2',
          '@internal'
      ];

      // Testing Summary Doc Elements
      const expectedSummary: IDocElement[] = [
          {kind: 'textDocElement', value: 'This function parses docTokens for the apiExtractor website'},
          {kind: 'linkDocElement', targetUrl: 'https://github.com/OfficeDev/office-ui-fabric-react'}
      ];
      const actualSummary: IDocElement[] = DocElementParser.parse(tokenStream);
      JsonFile.saveJsonFile('./lib/basicDocExpected.json', JSON.stringify(expectedSummary));
      JsonFile.saveJsonFile('./lib/basicDocActual.json', JSON.stringify(actualSummary));
      TestFileComparer.assertFileMatchesExpected('./lib/basicDocActual.json', './lib/basicDocExpected.json');

      // Testing Returns Doc Elements
      const expectedReturn: IDocElement[] = [
          {kind: 'textDocElement', value: 'an object'}
      ];
      tokenStream.shift();
      const actualReturn: IDocElement[] = DocElementParser.parse(tokenStream);
      JsonFile.saveJsonFile('./lib/returnDocExpected.json', JSON.stringify(expectedReturn));
      JsonFile.saveJsonFile('./lib/returnDocActual.json', JSON.stringify(actualReturn));
      TestFileComparer.assertFileMatchesExpected('./lib/returnDocActual.json', './lib/returnDocExpected.json');

      // Testing Params Doc Elements
      const expectedParam: IParam[] = [
          {
              name: 'param1',
              description: [{kind: 'textDocElement', value: 'description of the type param1'}]
          },
          {
              name: 'param2',
              description: [{kind: 'textDocElement', value: 'description of the type param2'}]
          }
      ];
      const actualParam: IParam[] = [];
      tokenStream.shift();
      actualParam.push(apiDoc.parseParam(tokenStream));
      tokenStream.shift();
      actualParam.push(apiDoc.parseParam(tokenStream));

      JsonFile.saveJsonFile('./lib/paramDocExpected.json', JSON.stringify(expectedParam));
      JsonFile.saveJsonFile('./lib/paramDocActual.json', JSON.stringify(actualParam));
      TestFileComparer.assertFileMatchesExpected('./lib/paramDocActual.json', './lib/paramDocExpected.json');
    });

    it('Should parse @deprecated correctly', (): void => {
      const tokenStream: string[] = [
          '@deprecated',
          '- description of the deprecation'
      ];

      // Testing Deprecated Doc Elements
      const expectedDeprecated: IDocElement[] = [
          {kind: 'textDocElement', value: '- description of the deprecation'}
      ];
      tokenStream.shift();
      const actualDeprecated: IDocElement[] = DocElementParser.parse(tokenStream);
      JsonFile.saveJsonFile('./lib/deprecatedDocExpected.json', JSON.stringify(expectedDeprecated));
      JsonFile.saveJsonFile('./lib/deprecatedDocActual.json', JSON.stringify(actualDeprecated));
      TestFileComparer.assertFileMatchesExpected('./lib/deprecatedDocActual.json', './lib/deprecatedDocExpected.json');
    });

    it('Should parse @see with nested link and/or text', (): void => {
      const tokenStream: string[] = [
          'Text describing the function’s purpose/nuances/context.',
          '@see',
          '{@link https://github.com/OfficeDev/office-ui-fabric-react}',
          'The link will provide context.'
      ];

      // Testing Summary Elements
      const expectedSummary: IDocElement[] = [
          {kind: 'textDocElement', value: 'Text describing the function’s purpose/nuances/context.'},
          {
              kind: 'seeDocElement',
              seeElements: [
                  {kind: 'linkDocElement', targetUrl: 'https://github.com/OfficeDev/office-ui-fabric-react'},
                  {kind: 'textDocElement', value: 'The link will provide context.'}
              ]
          }
      ];
      const actualSummary: IDocElement[] = DocElementParser.parse(tokenStream);
      JsonFile.saveJsonFile('./lib/seeDocExpected.json', JSON.stringify(expectedSummary));
      JsonFile.saveJsonFile('./lib/seeDocActual.json', JSON.stringify(actualSummary));
      TestFileComparer.assertFileMatchesExpected('./lib/seeDocExpected.json', './lib/seeDocActual.json');
    });

    it('Should parse @param with nested link and/or text', (): void => {
      const apiDoc: TestApiDocumentation = new TestApiDocumentation();
      const tokenStream: string[] = [
          'x - The height in {@link http://wikipedia.org/pixel_units}'
      ];

      // Testing Param Doc Elements
      const description: IDocElement[] = [
          {kind: 'textDocElement', value: 'The height in'},
          {kind: 'linkDocElement', targetUrl: 'http://wikipedia.org/pixel_units'}
      ];
      const expectedParam: IParam = {
          name: 'x',
          description: description
      };
      const actualParam: IParam = apiDoc.parseParam(tokenStream);

      JsonFile.saveJsonFile('./lib/nestedParamDocExpected.json', JSON.stringify(expectedParam));
      JsonFile.saveJsonFile('./lib/nestedParamDocActual.json', JSON.stringify(actualParam));
      TestFileComparer.assertFileMatchesExpected(
          './lib/nestedParamDocActual.json',
          './lib/nestedParamDocExpected.json'
      );
    });
  });
});

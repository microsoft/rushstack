// NOTE: THIS SOURCE FILE IS FOR DEBUGGING PURPOSES ONLY.
//       IT IS INVOKED BY THE "Run.cmd" AND "Debug.cmd" BATCH FILES.

import * as ts from 'typescript';
import Analyzer from './Analyzer';
import ApiFileGenerator from './generators/ApiFileGenerator';
import ApiJsonGenerator from './generators/ApiJsonGenerator';
import { IDocItem } from './IDocItem';
import { IApiDefinitionReference } from './IApiDefinitionReference';
import { IDocElement, IParam } from './IDocElement';
import DocItemLoader from './DocItemLoader';
import DocElementParser from './DocElementParser';
import TestFileComparer from './TestFileComparer';
import JsonFile from './JsonFile';
import ApiStructuredType from './definitions/ApiStructuredType';
import ApiDocumentation from './definitions/ApiDocumentation';
import Tokenizer from './Tokenizer';

let docs: string = '{@link @microsoft/sp-core-library:Guid.equals | Guid equals}';
let tokenizer: Tokenizer = new Tokenizer(docs, console.log);
/* tslint:disable:no-unused-variable */
const linkResult: IDocElement[] = DocElementParser.parse(tokenizer, console.log);

const analyzer: Analyzer = new Analyzer();

/**
 * Dummy class wrapping ApiDocumentation to test its protected methods
 */
let myDocumentedClass: ApiStructuredType;
class TestApiDocumentation extends ApiDocumentation {
  constructor() {
    super(myDocumentedClass, analyzer.docItemLoader, (msg: string) => { return; });
  }

  public parseParam(_tokenizer: Tokenizer): IParam {
    return this._parseParam(_tokenizer);
  }
}

/**
 * Debugging inheritdoc expression parser. 
 * Analyzer on example2 is needed for testing the parser.
 */
analyzer.analyze({
  compilerOptions: {
    target: ts.ScriptTarget.ES5,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    experimentalDecorators: true,
    jsx: ts.JsxEmit.React,
    rootDir: './testInputs/example2'
  },
  entryPointFile: './testInputs/example2/index.ts', // local/bundles/platform-exports.ts',
  otherFiles: []
});

const apiFileGenerator: ApiFileGenerator = new ApiFileGenerator();
apiFileGenerator.writeApiFile('./lib/DebugRun.api.ts', analyzer);

const apiJsonGenerator: ApiJsonGenerator = new ApiJsonGenerator();
apiJsonGenerator.writeJsonFile('./lib/DebugRun.json', analyzer);

myDocumentedClass = analyzer.package.getSortedMemberItems()
  .filter(apiItem => apiItem.name === 'MyDocumentedClass')[0] as ApiStructuredType;
const apiDoc: TestApiDocumentation = new TestApiDocumentation();

docs = '@param x - The height in {@link http://wikipedia.org/pixel_units}';
tokenizer = new Tokenizer(docs, console.log);
// ApiDocumentation gets the @param token before calling parseParam()
tokenizer.getToken();
apiDoc.parseParam(tokenizer);

/**
 * Put test cases here
 */
let apiReferenceExpr: string = '@microsoft/sp-core-library:Guid.equals';
let actual: IApiDefinitionReference;
actual = ApiDocumentation.parseApiReferenceExpression(apiReferenceExpr, apiDoc.reportError);

apiReferenceExpr = '@microsoft/sp-core-library:Guid';
actual = ApiDocumentation.parseApiReferenceExpression(apiReferenceExpr, apiDoc.reportError);

apiReferenceExpr = 'sp-core-library:Guid';
actual = ApiDocumentation.parseApiReferenceExpression(apiReferenceExpr, apiDoc.reportError);

apiReferenceExpr = 'Guid.equals';
actual = ApiDocumentation.parseApiReferenceExpression(apiReferenceExpr, apiDoc.reportError);

apiReferenceExpr = 'Guid';
actual = ApiDocumentation.parseApiReferenceExpression(apiReferenceExpr, apiDoc.reportError);

// Should report error
apiReferenceExpr = 'sp-core-library:Guid:equals';
try {
  actual = ApiDocumentation.parseApiReferenceExpression(apiReferenceExpr, apiDoc.reportError);
} catch (error) {
  console.log(error);
}

/**
 * Debugging DocItemLoader
 */
const apiDefinitionRef: IApiDefinitionReference = {
  scopeName: '@microsoft',
  packageName: 'sp-core-library',
  exportName: 'DisplayMode',
  memberName: ''
};

const docItemLoader: DocItemLoader = new DocItemLoader('./testInputs/example2');
/* tslint:disable:no-unused-variable */
const apiDocItemNotInCache: IDocItem = docItemLoader.getItem(apiDefinitionRef);
JsonFile.saveJsonFile('./lib/inheritedDoc-output.json', JSON.stringify(apiDocItemNotInCache));
TestFileComparer.assertFileMatchesExpected('./lib/inheritedDoc-output.json', './testInputs/inheritedDoc-output.json');
/* tslint:disable:no-unused-variable */
const apiDocItemInCache: IDocItem = docItemLoader.getItem(apiDefinitionRef);
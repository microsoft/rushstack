// @alpha
enum AccessModifier {
  // WARNING: The name "???" contains unsupported characters; API names should use only letters, numbers, and underscores
  '',
  // (undocumented)
  private,
  // (undocumented)
  protected,
  // (undocumented)
  public = 0
}

// @public
class ApiFileGenerator extends AstItemVisitor {
  // WARNING: The type "IndentedWriter" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  protected _indentedWriter: IndentedWriter;
  public static areEquivalentApiFileContents(actualFileContent: string, expectedFileContent: string): boolean;
  // (undocumented)
  public generateApiFileContent(extractor: Extractor): string;
  // WARNING: The type "AstParameter" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  protected visitApiParam(apiParam: AstParameter): void;
  // WARNING: The type "AstEnum" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  protected visitAstEnum(apiEnum: AstEnum): void;
  // WARNING: The type "AstEnumValue" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  protected visitAstEnumValue(apiEnumValue: AstEnumValue): void;
  // WARNING: The type "AstFunction" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  protected visitAstFunction(apiFunction: AstFunction): void;
  // WARNING: The type "AstMember" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  protected visitAstMember(apiMember: AstMember): void;
  // WARNING: The type "AstModuleVariable" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  protected visitAstModuleVariable(apiModuleVariable: AstModuleVariable): void;
  // WARNING: The type "AstNamespace" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  protected visitAstNamespace(apiNamespace: AstNamespace): void;
  // WARNING: The type "AstPackage" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  protected visitAstPackage(apiPackage: AstPackage): void;
  // WARNING: The type "AstStructuredType" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  protected visitAstStructuredType(apiStructuredType: AstStructuredType): void;
  public writeApiFile(reportFilename: string, extractor: Extractor): void;
}

// @public
class ApiJsonGenerator extends AstItemVisitor {
  // (undocumented)
  protected jsonOutput: Object;
  public static readonly jsonSchema: JsonSchema;
  // WARNING: The type "AstItem" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  protected visit(apiItem: AstItem, refObject?: Object): void;
  // WARNING: The type "AstParameter" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  protected visitApiParam(apiParam: AstParameter, refObject?: Object): void;
  // WARNING: The type "AstEnum" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  protected visitAstEnum(apiEnum: AstEnum, refObject?: Object): void;
  // WARNING: The type "AstEnumValue" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  protected visitAstEnumValue(apiEnumValue: AstEnumValue, refObject?: Object): void;
  // WARNING: The type "AstFunction" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  protected visitAstFunction(apiFunction: AstFunction, refObject?: Object): void;
  // WARNING: The type "AstMember" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  protected visitAstMember(apiMember: AstMember, refObject?: Object): void;
  // WARNING: The type "AstMethod" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  protected visitAstMethod(apiMethod: AstMethod, refObject?: Object): void;
  // WARNING: The type "AstModuleVariable" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  protected visitAstModuleVariable(apiModuleVariable: AstModuleVariable, refObject?: Object): void;
  // WARNING: The type "AstNamespace" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  protected visitAstNamespace(apiNamespace: AstNamespace, refObject?: Object): void;
  // WARNING: The type "AstPackage" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  protected visitAstPackage(apiPackage: AstPackage, refObject?: Object): void;
  // WARNING: The type "AstProperty" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  protected visitAstProperty(apiProperty: AstProperty, refObject?: Object): void;
  // WARNING: The type "AstStructuredType" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  protected visitAstStructuredType(apiStructuredType: AstStructuredType, refObject?: Object): void;
  // (undocumented)
  public writeJsonFile(reportFilename: string, extractor: Extractor): void;
}

// @public
class ExternalApiHelper {
  // (undocumented)
  public static generateApiJson(rootDir: string, libFolder: string, externalPackageFilePath: string): void;
}

// @public
class Extractor {
  constructor(options: IExtractorOptions);
  public analyze(options: IExtractorAnalyzeOptions): void;
  public static defaultErrorHandler(message: string, fileName: string, lineNumber: number): void;
  // WARNING: The type "DocItemLoader" needs to be exported by the package (e.g. added to index.ts)
  public docItemLoader: DocItemLoader;
  // (undocumented)
  public errorHandler: ApiErrorHandler;
  public loadExternalPackages(externalJsonCollectionPath: string): void;
  // WARNING: The type "AstPackage" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  public package: AstPackage;
  public readonly packageFolder: string;
  // (undocumented)
  public packageJsonLookup: PackageJsonLookup;
  public reportError(message: string, sourceFile: ts.SourceFile, start: number): void;
  // (undocumented)
  public typeChecker: ts.TypeChecker;
}

// @alpha
interface IBaseDocElement {
  // (undocumented)
  kind: string;
}

// WARNING: Unable to find referenced export "ApiReference"
// @alpha
interface ICodeLinkElement extends IBaseDocElement {
  exportName: string;
  memberName?: string;
  packageName?: string;
  referenceType: 'code';
  scopeName?: string;
  value?: string;
}

// @alpha
interface IDocBase {
  // (undocumented)
  deprecatedMessage?: IDocElement[];
  // (undocumented)
  isBeta: boolean;
  kind: string;
  // (undocumented)
  remarks?: IDocElement[];
  // (undocumented)
  summary: IDocElement[];
}

// @alpha
interface IDocClass extends IDocBase {
  extends?: string;
  implements?: string;
  kind: 'class';
  members: {
    [ name: string ]: IDocMember
  }
  typeParameters?: string[];
}

// @alpha
interface IDocEnum extends IDocBase {
  kind: 'enum';
  // (undocumented)
  values: IDocEnumValue[];
}

// @alpha
interface IDocEnumValue {
  // (undocumented)
  deprecatedMessage?: IDocElement[];
  // (undocumented)
  remarks?: IDocElement[];
  // (undocumented)
  summary?: IDocElement[];
  // (undocumented)
  value: string;
}

// @alpha
interface IDocFunction extends IDocBase {
  kind: 'function';
  parameters: {
    [ name: string ]: IDocParam
  }
  returnValue: IDocReturnValue;
}

// @alpha
interface IDocInterface extends IDocBase {
  extends?: string;
  implements?: string;
  kind: 'interface';
  members: {
    [ name: string ]: IDocMember
  }
  typeParameters?: string[];
}

// @alpha
interface IDocMethod extends IDocBase {
  accessModifier: AccessModifier;
  isOptional: boolean;
  isStatic: boolean;
  kind: 'method';
  parameters: {
    [ name: string ]: IDocParam
  }
  returnValue: IDocReturnValue;
  signature: string;
}

// @alpha
interface IDocPackage {
  // (undocumented)
  deprecatedMessage?: IDocElement[];
  exports: {
    [ name: string ]: IDocItem
  }
  isBeta?: boolean;
  kind: 'package';
  // (undocumented)
  remarks?: IDocElement[];
  // (undocumented)
  summary?: IDocElement[];
}

// @alpha
interface IDocParam {
  description: IDocElement[];
  isOptional: boolean;
  isSpread: boolean;
  name: string;
  type: string;
}

// @alpha
interface IDocProperty extends IDocBase {
  isOptional: boolean;
  isReadOnly: boolean;
  isStatic: boolean;
  kind: 'property';
  type: string;
}

// @alpha
interface IDocReturnValue {
  description: IDocElement[];
  type: string;
}

// @alpha
interface IDomCode {
  // (undocumented)
  code: string;
  // (undocumented)
  highlighter: DomCodeHighlighter;
  // (undocumented)
  kind: 'code';
}

// @alpha
interface IDomCodeBox {
  // (undocumented)
  code: string;
  // (undocumented)
  highlighter: DomCodeHighlighter;
  // (undocumented)
  kind: 'code-box';
}

// @alpha
interface IDomDocumentationLink {
  // (undocumented)
  elements: DomLinkText[];
  // (undocumented)
  kind: 'doc-link';
  // (undocumented)
  targetDocId: string;
}

// @alpha
interface IDomHeading1 {
  // (undocumented)
  kind: 'heading1';
  // (undocumented)
  text: string;
}

// @alpha
interface IDomHeading2 {
  // (undocumented)
  kind: 'heading2';
  // (undocumented)
  text: string;
}

// @alpha
interface IDomLineBreak {
  // (undocumented)
  kind: 'break';
}

// @alpha
interface IDomNoteBox {
  // (undocumented)
  elements: DomBasicText[];
  // (undocumented)
  kind: 'note-box';
}

// @alpha
interface IDomPage {
  // (undocumented)
  breadcrumb: DomBasicText[];
  // (undocumented)
  docId: string;
  // (undocumented)
  elements: DomTopLevelElement[];
  // (undocumented)
  kind: 'page';
  // (undocumented)
  title: string;
}

// @alpha
interface IDomParagraph {
  // (undocumented)
  kind: 'paragraph';
}

// @alpha
interface IDomTable {
  // (undocumented)
  header?: IDomTableRow;
  // (undocumented)
  kind: 'table';
  // (undocumented)
  rows: IDomTableRow[];
}

// @alpha
interface IDomTableCell {
  // (undocumented)
  elements: DomBasicText[];
  // (undocumented)
  kind: 'table-cell';
}

// @alpha
interface IDomTableRow {
  // (undocumented)
  cells: IDomTableCell[];
  // (undocumented)
  kind: 'table-row';
}

// @alpha
interface IDomText {
  // (undocumented)
  bold?: boolean;
  // (undocumented)
  content: string;
  // (undocumented)
  italics?: boolean;
  // (undocumented)
  kind: 'text';
}

// @alpha
interface IDomWebLink {
  // (undocumented)
  elements: DomLinkText[];
  // (undocumented)
  kind: 'web-link';
  // (undocumented)
  targetUrl: string;
}

// @public
interface IExtractorAnalyzeOptions {
  entryPointFile: string;
  otherFiles?: string[];
}

// @public
interface IExtractorOptions {
  compilerOptions: ts.CompilerOptions;
  // (undocumented)
  errorHandler?: ApiErrorHandler;
}

// @alpha (undocumented)
interface IHrefLinkElement extends IBaseDocElement {
  referenceType: 'href';
  targetUrl: string;
  value?: string;
}

// @alpha
interface IParam {
  // (undocumented)
  description: IDocElement[];
  // (undocumented)
  isOptional?: boolean;
  // (undocumented)
  isSpread?: boolean;
  // (undocumented)
  name: string;
  // (undocumented)
  type?: string;
}

// @alpha
interface IReturn {
  // (undocumented)
  description: IDocElement[];
  // (undocumented)
  type: string;
}

// @alpha
interface ISeeDocElement extends IBaseDocElement {
  // (undocumented)
  kind: 'seeDocElement';
  // (undocumented)
  seeElements: IDocElement[];
}

// @alpha
interface ITextElement extends IBaseDocElement {
  // (undocumented)
  kind: 'textDocElement';
  // (undocumented)
  value: string;
}

// WARNING: Unsupported export: ApiErrorHandler
// WARNING: Unsupported export: IDocMember
// WARNING: Unsupported export: IDocItem
// WARNING: Unsupported export: DomCodeHighlighter
// WARNING: Unsupported export: DomLinkText
// WARNING: Unsupported export: DomBasicText
// WARNING: Unsupported export: DomTopLevelElement
// WARNING: Unsupported export: DomElement
// WARNING: Unsupported export: ILinkDocElement
// WARNING: Unsupported export: IDocElement

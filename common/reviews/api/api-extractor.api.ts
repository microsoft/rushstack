// @public
class ApiJsonFile {
  public static jsonSchema: JsonSchema;
  public static loadFromFile(apiJsonFilePath: string): IApiPackage;
}

// @beta
class ExternalApiHelper {
  // (undocumented)
  public static generateApiJson(rootDir: string, libFolder: string, externalPackageFilePath: string): void;
}

// @public
class Extractor {
  public constructor(config: IExtractorConfig, options?: IExtractorOptions);
  public analyzeProject(options?: IAnalyzeProjectOptions): void;
  public static jsonSchema: JsonSchema;
}

// @public
interface IAnalyzeProjectOptions {
  projectConfig?: IExtractorProjectConfig;
}

// @alpha
interface IApiBaseDefinition {
  // (undocumented)
  deprecatedMessage?: MarkupElement[];
  // (undocumented)
  isBeta: boolean;
  kind: string;
  // (undocumented)
  remarks?: MarkupElement[];
  // (undocumented)
  summary: MarkupElement[];
}

// @alpha
interface IApiClass extends IApiBaseDefinition {
  extends?: string;
  implements?: string;
  kind: 'class';
  members: IApiNameMap<ApiMember>;
  typeParameters?: string[];
}

// @alpha
interface IApiConstructor extends IApiBaseDefinition {
  kind: 'constructor';
  parameters: IApiNameMap<IApiParameter>;
  signature: string;
}

// @alpha
interface IApiEnum extends IApiBaseDefinition {
  kind: 'enum';
  // (undocumented)
  values: IApiEnumMember[];
}

// @alpha
interface IApiEnumMember extends IApiBaseDefinition {
  kind: 'enum value';
  // (undocumented)
  value: string;
}

// @alpha
interface IApiFunction extends IApiBaseDefinition {
  kind: 'function';
  parameters: IApiNameMap<IApiParameter>;
  returnValue: IApiReturnValue;
  signature: string;
}

// @alpha
interface IApiInterface extends IApiBaseDefinition {
  extends?: string;
  implements?: string;
  kind: 'interface';
  members: IApiNameMap<ApiMember>;
  typeParameters?: string[];
}

// @alpha
interface IApiItemReference {
  exportName: string;
  memberName: string;
  packageName: string;
  scopeName: string;
}

// @alpha
interface IApiMethod extends IApiBaseDefinition {
  accessModifier: ApiAccessModifier;
  isOptional: boolean;
  isStatic: boolean;
  kind: 'method';
  parameters: IApiNameMap<IApiParameter>;
  returnValue: IApiReturnValue;
  signature: string;
}

// @alpha
interface IApiNameMap<T> {
  // (undocumented)
  [ name: string ]: T;
}

// @alpha
interface IApiNamespace extends IApiBaseDefinition {
  exports: IApiNameMap<ApiItem>;
  kind: 'namespace';
}

// @alpha
interface IApiPackage {
  // (undocumented)
  deprecatedMessage?: MarkupElement[];
  exports: IApiNameMap<ApiItem>;
  isBeta?: boolean;
  kind: 'package';
  name: string;
  // (undocumented)
  remarks?: MarkupElement[];
  // (undocumented)
  summary?: MarkupElement[];
}

// @alpha
interface IApiParameter {
  description: MarkupElement[];
  isOptional: boolean;
  isSpread: boolean;
  name: string;
  type: string;
}

// @alpha
interface IApiProperty extends IApiBaseDefinition {
  isOptional: boolean;
  isReadOnly: boolean;
  isStatic: boolean;
  kind: 'property';
  signature: string;
  type: string;
}

// @alpha
interface IApiReturnValue {
  // (undocumented)
  description: MarkupElement[];
  // (undocumented)
  type: string;
}

// @public
interface IExtractorApiJsonFileConfig {
  enabled: boolean;
  outputFolder?: string;
}

// @public
interface IExtractorApiReviewFileConfig {
  apiReviewFolder?: string;
  enabled: boolean;
  tempFolder?: string;
}

// @public
interface IExtractorConfig {
  apiJsonFile?: IExtractorApiJsonFileConfig;
  apiReviewFile?: IExtractorApiReviewFileConfig;
  compiler: IExtractorTsconfigCompilerConfig | IExtractorRuntimeCompilerConfig;
  policies?: IExtractorPoliciesConfig;
  project: IExtractorProjectConfig;
}

// @public
interface IExtractorOptions {
  compilerProgram?: ts.Program;
  customLogger?: Partial<ILogger>;
  localBuild?: boolean;
}

// @public
interface IExtractorPoliciesConfig {
  namespaceSupport: 'conservative' | 'permissive';
}

// @public
interface IExtractorProjectConfig {
  entryPointSourceFile: string;
  externalJsonFileFolders?: string[];
}

// @public
interface IExtractorRuntimeCompilerConfig {
  // (undocumented)
  configType: 'runtime';
}

// @public
interface IExtractorTsconfigCompilerConfig {
  // (undocumented)
  configType: 'tsconfig';
  overrideTsconfig?: {
  }
  rootFolder: string;
}

// @public
interface ILogger {
  logError(message: string): void;
  logInfo(message: string): void;
  logVerbose(message: string): void;
  logWarning(message: string): void;
}

// @alpha
interface IMarkupApiLink {
  // (undocumented)
  elements: MarkupLinkTextElement[];
  // (undocumented)
  kind: 'api-link';
  // (undocumented)
  target: IApiItemReference;
}

// @alpha
interface IMarkupCodeBox {
  // (undocumented)
  highlighter: MarkupHighlighter;
  // (undocumented)
  kind: 'code-box';
  text: string;
}

// @alpha
interface IMarkupHeading1 {
  // (undocumented)
  kind: 'heading1';
  text: string;
}

// @alpha
interface IMarkupHeading2 {
  // (undocumented)
  kind: 'heading2';
  text: string;
}

// @alpha
interface IMarkupHighlightedText {
  // (undocumented)
  highlighter: MarkupHighlighter;
  // (undocumented)
  kind: 'code';
  text: string;
}

// @alpha
interface IMarkupLineBreak {
  // (undocumented)
  kind: 'break';
}

// @alpha
interface IMarkupNoteBox {
  // (undocumented)
  elements: MarkupBasicElement[];
  // (undocumented)
  kind: 'note-box';
}

// @alpha
interface IMarkupPage {
  // (undocumented)
  breadcrumb: MarkupBasicElement[];
  // (undocumented)
  elements: MarkupStructuredElement[];
  // (undocumented)
  kind: 'page';
  // (undocumented)
  title: string;
}

// @alpha
interface IMarkupParagraph {
  // (undocumented)
  kind: 'paragraph';
}

// @alpha
interface IMarkupTable {
  // (undocumented)
  header?: IMarkupTableRow;
  // (undocumented)
  kind: 'table';
  // (undocumented)
  rows: IMarkupTableRow[];
}

// @alpha
interface IMarkupTableCell {
  // (undocumented)
  elements: MarkupBasicElement[];
  // (undocumented)
  kind: 'table-cell';
}

// @alpha
interface IMarkupTableRow {
  // (undocumented)
  cells: IMarkupTableCell[];
  // (undocumented)
  kind: 'table-row';
}

// @alpha
interface IMarkupText {
  // (undocumented)
  bold?: boolean;
  // (undocumented)
  italics?: boolean;
  // (undocumented)
  kind: 'text';
  text: string;
}

// @alpha
interface IMarkupWebLink {
  // (undocumented)
  elements: MarkupLinkTextElement[];
  // (undocumented)
  kind: 'web-link';
  // (undocumented)
  targetUrl: string;
}

// @public
class Markup {
  public static BREAK: IMarkupLineBreak;
  public static createApiLink(textElements: MarkupLinkTextElement[], target: IApiItemReference): IMarkupApiLink;
  public static createApiLinkFromText(text: string, target: IApiItemReference): IMarkupApiLink;
  public static createCode(code: string, highlighter?: MarkupHighlighter): IMarkupHighlightedText;
  public static createCodeBox(code: string, highlighter: MarkupHighlighter): IMarkupCodeBox;
  public static createHeading1(text: string): IMarkupHeading1;
  public static createHeading2(text: string): IMarkupHeading2;
  public static createNoteBox(textElements: MarkupBasicElement[]): IMarkupNoteBox;
  public static createNoteBoxFromText(text: string): IMarkupNoteBox;
  public static createPage(title: string): IMarkupPage;
  public static createTable(headerCellValues: MarkupBasicElement[][] | undefined = undefined): IMarkupTable;
  public static createTableRow(cellValues: MarkupBasicElement[][] | undefined = undefined): IMarkupTableRow;
  public static createTextElements(text: string, options?: { bold?: boolean, italics?: boolean }): IMarkupText[];
  public static createWebLink(textElements: MarkupLinkTextElement[], targetUrl: string): IMarkupWebLink;
  public static createWebLinkFromText(text: string, targetUrl: string): IMarkupWebLink;
  public static extractTextContent(elements: MarkupElement[]): string;
  public static PARAGRAPH: IMarkupParagraph;
}

// WARNING: Unsupported export: ApiAccessModifier
// WARNING: Unsupported export: ApiMember
// WARNING: Unsupported export: ApiItem
// WARNING: Unsupported export: MarkupHighlighter
// WARNING: Unsupported export: MarkupLinkTextElement
// WARNING: Unsupported export: MarkupBasicElement
// WARNING: Unsupported export: MarkupStructuredElement
// WARNING: Unsupported export: MarkupElement

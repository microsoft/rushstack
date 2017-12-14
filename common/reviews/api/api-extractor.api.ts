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
  public readonly actualConfig: IExtractorConfig;
  // @deprecated
  public analyzeProject(options?: IAnalyzeProjectOptions): void;
  public static jsonSchema: JsonSchema;
  public processProject(options?: IAnalyzeProjectOptions): boolean;
}

// @public
interface IAnalyzeProjectOptions {
  projectConfig?: IExtractorProjectConfig;
}

// @alpha
interface IApiBaseDefinition {
  // (undocumented)
  deprecatedMessage?: MarkupBasicElement[];
  // (undocumented)
  isBeta: boolean;
  kind: string;
  // (undocumented)
  remarks: MarkupStructuredElement[];
  // (undocumented)
  summary: MarkupBasicElement[];
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
  deprecatedMessage?: MarkupBasicElement[];
  exports: IApiNameMap<ApiItem>;
  isBeta: boolean;
  kind: 'package';
  name: string;
  // (undocumented)
  remarks: MarkupStructuredElement[];
  // (undocumented)
  summary: MarkupBasicElement[];
}

// @alpha
interface IApiParameter {
  description: MarkupBasicElement[];
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
  description: MarkupBasicElement[];
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
  // @beta
  packageTypings?: IExtractorPackageTypingsConfig;
  policies?: IExtractorPoliciesConfig;
  project: IExtractorProjectConfig;
}

// @public
interface IExtractorOptions {
  compilerProgram?: ts.Program;
  customLogger?: Partial<ILogger>;
  localBuild?: boolean;
}

// @beta
interface IExtractorPackageTypingsConfig {
  enabled: boolean;
  internalFilename?: string;
  outputFolder?: string;
  previewFilename?: string;
  publicFilename?: string;
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

// @public
interface IMarkupApiLink {
  elements: MarkupLinkTextElement[];
  kind: 'api-link';
  target: IApiItemReference;
}

// @public
interface IMarkupCodeBox {
  // (undocumented)
  highlighter: MarkupHighlighter;
  kind: 'code-box';
  text: string;
}

// @public
interface IMarkupCreateTextOptions {
  bold?: boolean;
  italics?: boolean;
}

// @public
interface IMarkupHeading1 {
  kind: 'heading1';
  text: string;
}

// @public
interface IMarkupHeading2 {
  kind: 'heading2';
  text: string;
}

// @public
interface IMarkupHighlightedText {
  highlighter: MarkupHighlighter;
  kind: 'code';
  text: string;
}

// @public
interface IMarkupLineBreak {
  kind: 'break';
}

// @public
interface IMarkupNoteBox {
  // (undocumented)
  elements: MarkupBasicElement[];
  kind: 'note-box';
}

// @public
interface IMarkupPage {
  // (undocumented)
  breadcrumb: MarkupBasicElement[];
  // (undocumented)
  elements: MarkupStructuredElement[];
  kind: 'page';
  // (undocumented)
  title: string;
}

// @public
interface IMarkupParagraph {
  kind: 'paragraph';
}

// @public
interface IMarkupTable {
  // (undocumented)
  header?: IMarkupTableRow;
  kind: 'table';
  // (undocumented)
  rows: IMarkupTableRow[];
}

// @public
interface IMarkupTableCell {
  elements: MarkupBasicElement[];
  kind: 'table-cell';
}

// @public
interface IMarkupTableRow {
  // (undocumented)
  cells: IMarkupTableCell[];
  kind: 'table-row';
}

// @public
interface IMarkupText {
  bold?: boolean;
  italics?: boolean;
  kind: 'text';
  text: string;
}

// @public
interface IMarkupWebLink {
  elements: MarkupLinkTextElement[];
  kind: 'web-link';
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
  public static createTextElements(text: string, options?: IMarkupCreateTextOptions): IMarkupText[];
  public static createTextParagraphs(text: string, options?: IMarkupCreateTextOptions): MarkupBasicElement[];
  public static createWebLink(textElements: MarkupLinkTextElement[], targetUrl: string): IMarkupWebLink;
  public static createWebLinkFromText(text: string, targetUrl: string): IMarkupWebLink;
  public static extractTextContent(elements: MarkupElement[]): string;
  public static normalize < T extends MarkupElement >(elements: T[]): void;
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

// @public
class ApiJsonFile {
  static jsonSchema: JsonSchema;
  static loadFromFile(apiJsonFilePath: string): IApiPackage;
}

// @beta
class ExternalApiHelper {
  // (undocumented)
  static generateApiJson(rootDir: string, libFolder: string, externalPackageFilePath: string): void;
}

// @public
class Extractor {
  constructor(config: IExtractorConfig, options?: IExtractorOptions);
  readonly actualConfig: IExtractorConfig;
  // @deprecated
  analyzeProject(options?: IAnalyzeProjectOptions): void;
  static generateFilePathsForAnalysis(inputFilePaths: string[]): string[];
  static jsonSchema: JsonSchema;
  processProject(options?: IAnalyzeProjectOptions): boolean;
  static processProjectFromConfigFile(jsonConfigFile: string, options?: IExtractorOptions): void;
  static readonly version: string;
}

// @public
enum ExtractorValidationRulePolicy {
  allow = "allow",
  error = "error"
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
  isSealed: boolean;
  kind: 'class';
  members: IApiNameMap<ApiMember>;
  typeParameters?: string[];
}

// @alpha
interface IApiConstructor extends IApiBaseDefinition {
  isOverride: boolean;
  isSealed: boolean;
  isVirtual: boolean;
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
  isSealed: boolean;
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
  isOverride: boolean;
  isSealed: boolean;
  isStatic: boolean;
  isVirtual: boolean;
  kind: 'method';
  parameters: IApiNameMap<IApiParameter>;
  returnValue: IApiReturnValue;
  signature: string;
}

// @alpha
interface IApiNameMap<T> {
  [name: string]: T;
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
  isEventProperty: boolean;
  isOptional: boolean;
  isOverride: boolean;
  isReadOnly: boolean;
  isSealed: boolean;
  isStatic: boolean;
  isVirtual: boolean;
  kind: 'property';
  signature: string;
  type: string;
}

// @alpha
interface IApiReturnValue {
  description: MarkupBasicElement[];
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
  dtsRollup?: IExtractorDtsRollupConfig;
  policies?: IExtractorPoliciesConfig;
  project: IExtractorProjectConfig;
  validationRules?: IExtractorValidationRulesConfig;
}

// @beta
interface IExtractorDtsRollupConfig {
  enabled: boolean;
  mainDtsRollupPath?: string;
  publishFolder?: string;
  publishFolderForBeta?: string;
  publishFolderForInternal?: string;
  publishFolderForPublic?: string;
  trimming?: boolean;
}

// @public
interface IExtractorOptions {
  compilerProgram?: ts.Program;
  customLogger?: Partial<ILogger>;
  localBuild?: boolean;
  skipLibCheck?: boolean;
  // @beta
  typescriptCompilerFolder?: string;
}

// @public
interface IExtractorPoliciesConfig {
  namespaceSupport?: 'conservative' | 'permissive';
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
interface IExtractorValidationRulesConfig {
  missingReleaseTags?: ExtractorValidationRulePolicy;
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
interface IMarkupHtmlTag {
  kind: 'html-tag';
  token: string;
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
  static appendTextElements(output: MarkupElement[], text: string, options?: IMarkupCreateTextOptions): void;
  static BREAK: IMarkupLineBreak;
  static createApiLink(textElements: MarkupLinkTextElement[], target: IApiItemReference): IMarkupApiLink;
  static createApiLinkFromText(text: string, target: IApiItemReference): IMarkupApiLink;
  static createCode(code: string, highlighter?: MarkupHighlighter): IMarkupHighlightedText;
  static createCodeBox(code: string, highlighter: MarkupHighlighter): IMarkupCodeBox;
  static createHeading1(text: string): IMarkupHeading1;
  static createHeading2(text: string): IMarkupHeading2;
  static createHtmlTag(token: string): IMarkupHtmlTag;
  static createNoteBox(textElements: MarkupBasicElement[]): IMarkupNoteBox;
  static createNoteBoxFromText(text: string): IMarkupNoteBox;
  static createPage(title: string): IMarkupPage;
  static createTable(headerCellValues?: MarkupBasicElement[][] | undefined): IMarkupTable;
  static createTableRow(cellValues?: MarkupBasicElement[][] | undefined): IMarkupTableRow;
  static createTextElements(text: string, options?: IMarkupCreateTextOptions): IMarkupText[];
  static createTextParagraphs(text: string, options?: IMarkupCreateTextOptions): MarkupBasicElement[];
  static createWebLink(textElements: MarkupLinkTextElement[], targetUrl: string): IMarkupWebLink;
  static createWebLinkFromText(text: string, targetUrl: string): IMarkupWebLink;
  static extractTextContent(elements: MarkupElement[]): string;
  static formatApiItemReference(apiItemReference: IApiItemReference): string;
  static normalize<T extends MarkupElement>(elements: T[]): void;
  static PARAGRAPH: IMarkupParagraph;
}

// WARNING: Unsupported export: ApiAccessModifier
// WARNING: Unsupported export: ApiMember
// WARNING: Unsupported export: ApiItem
// WARNING: Unsupported export: MarkupHighlighter
// WARNING: Unsupported export: MarkupLinkTextElement
// WARNING: Unsupported export: MarkupBasicElement
// WARNING: Unsupported export: MarkupStructuredElement
// WARNING: Unsupported export: MarkupElement

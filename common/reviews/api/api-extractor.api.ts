// @beta
class ApiExtractor {
  public constructor(config: IExtractorConfig);
  public analyzeProject(options?: IAnalyzeProjectOptions): void;
  // (undocumented)
  public static jsonSchema: JsonSchema;
}

// @public
class ExternalApiHelper {
  // (undocumented)
  public static generateApiJson(rootDir: string, libFolder: string, externalPackageFilePath: string): void;
}

// @beta
interface IAnalyzeProjectOptions {
  projectConfig?: IExtractorProjectConfig;
}

// @alpha
interface IApiBaseDefinition {
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
interface IApiPackage {
  // (undocumented)
  deprecatedMessage?: IDocElement[];
  exports: IApiNameMap<ApiItem>;
  isBeta?: boolean;
  kind: 'package';
  name: string;
  // (undocumented)
  remarks?: IDocElement[];
  // (undocumented)
  summary?: IDocElement[];
}

// @alpha
interface IApiParameter {
  description: IDocElement[];
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
  description: IDocElement[];
  // (undocumented)
  type: string;
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

// @beta
interface IExtractorApiJsonFileConfig {
  enabled: boolean;
  outputFolder?: string;
}

// @beta
interface IExtractorApiReviewFileConfig {
  apiReviewFolder: string;
  enabled: boolean;
}

// @beta
interface IExtractorConfig {
  apiJsonFile: IExtractorApiJsonFileConfig;
  apiReviewFile: IExtractorApiReviewFileConfig;
  compiler: IExtractorTsconfigCompilerConfig | IExtractorRuntimeCompilerConfig;
  customErrorHandler?: ExtractorErrorHandler;
  project: IExtractorProjectConfig;
}

// @beta
interface IExtractorProjectConfig {
  entryPointSourceFile: string;
  externalJsonFileFolders: string[];
}

// @beta
interface IExtractorRuntimeCompilerConfig {
  // (undocumented)
  configType: 'runtime';
  // (undocumented)
  program: ts.Program;
}

// @beta
interface IExtractorTsconfigCompilerConfig {
  // (undocumented)
  configType: 'tsconfig';
  overrideTsconfig?: {
  }
  rootFolder: string;
}

// @alpha (undocumented)
interface IHrefLinkElement extends IBaseDocElement {
  referenceType: 'href';
  targetUrl: string;
  value?: string;
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

// @alpha
interface IParagraphElement extends IBaseDocElement {
  // (undocumented)
  kind: 'paragraphDocElement';
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

// WARNING: Unsupported export: ExtractorErrorHandler
// WARNING: Unsupported export: ApiAccessModifier
// WARNING: Unsupported export: ApiMember
// WARNING: Unsupported export: ApiItem
// WARNING: Unsupported export: MarkupHighlighter
// WARNING: Unsupported export: MarkupLinkTextElement
// WARNING: Unsupported export: MarkupBasicElement
// WARNING: Unsupported export: MarkupStructuredElement
// WARNING: Unsupported export: MarkupElement
// WARNING: Unsupported export: ILinkDocElement
// WARNING: Unsupported export: IDocElement

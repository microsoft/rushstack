// @public
class ApiCallSignature extends ApiCallSignature_base {
  constructor(options: IApiCallSignatureOptions);
  // @override (undocumented)
  readonly canonicalReference: string;
  // (undocumented)
  static getCanonicalReference(overloadIndex: number): string;
  // @override (undocumented)
  readonly kind: ApiItemKind;
}

// @public
class ApiClass extends ApiClass_base {
  constructor(options: IApiClassOptions);
  // @override (undocumented)
  readonly canonicalReference: string;
  readonly extendsType: HeritageType | undefined;
  // (undocumented)
  static getCanonicalReference(name: string): string;
  readonly implementsTypes: ReadonlyArray<HeritageType>;
  // @override (undocumented)
  readonly kind: ApiItemKind;
  // WARNING: The type "IApiClassJson" needs to be exported by the package (e.g. added to index.ts)
  // @override (undocumented)
  static onDeserializeInto(options: Partial<IApiClassOptions>, jsonObject: IApiClassJson): void;
  // WARNING: The type "IApiClassJson" needs to be exported by the package (e.g. added to index.ts)
  // @override (undocumented)
  serializeInto(jsonObject: Partial<IApiClassJson>): void;
}

// @public
class ApiConstructor extends ApiConstructor_base {
  constructor(options: IApiConstructorOptions);
  // @override (undocumented)
  readonly canonicalReference: string;
  // (undocumented)
  static getCanonicalReference(isStatic: boolean, overloadIndex: number): string;
  // @override (undocumented)
  readonly kind: ApiItemKind;
}

// @public
class ApiConstructSignature extends ApiConstructSignature_base {
  constructor(options: IApiConstructSignatureOptions);
  // @override (undocumented)
  readonly canonicalReference: string;
  // (undocumented)
  static getCanonicalReference(overloadIndex: number): string;
  // @override (undocumented)
  readonly kind: ApiItemKind;
}

// @public
class ApiDeclaredItem extends ApiDocumentedItem {
  constructor(options: IApiDeclaredItemOptions);
  buildExcerpt(tokenRange: IExcerptTokenRange): Excerpt;
  readonly excerpt: Excerpt;
  readonly excerptTokens: ReadonlyArray<ExcerptToken>;
  getExcerptWithModifiers(): string;
  // WARNING: The type "IApiDeclaredItemJson" needs to be exported by the package (e.g. added to index.ts)
  // @override (undocumented)
  static onDeserializeInto(options: Partial<IApiDeclaredItemOptions>, jsonObject: IApiDeclaredItemJson): void;
  // WARNING: The type "IApiDeclaredItemJson" needs to be exported by the package (e.g. added to index.ts)
  // @override (undocumented)
  serializeInto(jsonObject: Partial<IApiDeclaredItemJson>): void;
}

// @public
class ApiDocumentedItem extends ApiItem {
  constructor(options: IApiDocumentedItemOptions);
  // WARNING: The type "IApiItemJson" needs to be exported by the package (e.g. added to index.ts)
  // @override (undocumented)
  static onDeserializeInto(options: Partial<IApiDocumentedItemOptions>, jsonObject: IApiItemJson): void;
  // WARNING: The type "IApiDocumentedItemJson" needs to be exported by the package (e.g. added to index.ts)
  // @override (undocumented)
  serializeInto(jsonObject: Partial<IApiDocumentedItemJson>): void;
  // (undocumented)
  readonly tsdocComment: tsdoc.DocComment | undefined;
}

// @public
class ApiEntryPoint extends ApiEntryPoint_base {
  constructor(options: IApiEntryPointOptions);
  // @override (undocumented)
  readonly canonicalReference: string;
  // @override (undocumented)
  readonly kind: ApiItemKind;
}

// @public
class ApiEnum extends ApiEnum_base {
  constructor(options: IApiEnumOptions);
  // @override (undocumented)
  addMember(member: ApiEnumMember): void;
  // @override (undocumented)
  readonly canonicalReference: string;
  // (undocumented)
  static getCanonicalReference(name: string): string;
  // @override (undocumented)
  readonly kind: ApiItemKind;
  // @override (undocumented)
  readonly members: ReadonlyArray<ApiEnumMember>;
}

// @public
class ApiEnumMember extends ApiEnumMember_base {
  constructor(options: IApiEnumMemberOptions);
  // @override (undocumented)
  readonly canonicalReference: string;
  // (undocumented)
  static getCanonicalReference(name: string): string;
  readonly initializerExcerpt: Excerpt;
  // @override (undocumented)
  readonly kind: ApiItemKind;
  // WARNING: The type "IApiEnumMemberJson" needs to be exported by the package (e.g. added to index.ts)
  // @override (undocumented)
  static onDeserializeInto(options: Partial<IApiEnumMemberOptions>, jsonObject: IApiEnumMemberJson): void;
  // WARNING: The type "IApiEnumMemberJson" needs to be exported by the package (e.g. added to index.ts)
  // @override (undocumented)
  serializeInto(jsonObject: Partial<IApiEnumMemberJson>): void;
}

// @public
class ApiFunction extends ApiFunction_base {
  constructor(options: IApiFunctionOptions);
  // @override (undocumented)
  readonly canonicalReference: string;
  // (undocumented)
  static getCanonicalReference(name: string, overloadIndex: number): string;
  // @override (undocumented)
  readonly kind: ApiItemKind;
}

// @public
class ApiIndexSignature extends ApiIndexSignature_base {
  constructor(options: IApiIndexSignatureOptions);
  // @override (undocumented)
  readonly canonicalReference: string;
  // (undocumented)
  static getCanonicalReference(overloadIndex: number): string;
  // @override (undocumented)
  readonly kind: ApiItemKind;
}

// @public
class ApiInterface extends ApiInterface_base {
  constructor(options: IApiInterfaceOptions);
  // @override (undocumented)
  readonly canonicalReference: string;
  readonly extendsTypes: ReadonlyArray<HeritageType>;
  // (undocumented)
  static getCanonicalReference(name: string): string;
  // @override (undocumented)
  readonly kind: ApiItemKind;
  // WARNING: The type "IApiInterfaceJson" needs to be exported by the package (e.g. added to index.ts)
  // @override (undocumented)
  static onDeserializeInto(options: Partial<IApiInterfaceOptions>, jsonObject: IApiInterfaceJson): void;
  // WARNING: The type "IApiInterfaceJson" needs to be exported by the package (e.g. added to index.ts)
  // @override (undocumented)
  serializeInto(jsonObject: Partial<IApiInterfaceJson>): void;
}

// @public
class ApiItem {
  // (undocumented)
  __computed: ApiItem | undefined;
  constructor(options: IApiItemOptions);
  // @virtual (undocumented)
  readonly canonicalReference: string;
  // WARNING: The type "IApiItemJson" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  static deserialize(jsonObject: IApiItemJson): ApiItem;
  // @virtual
  readonly displayName: string;
  getAssociatedPackage(): ApiPackage | undefined;
  getHierarchy(): ReadonlyArray<ApiItem>;
  getScopedNameWithinPackage(): string;
  // @virtual (undocumented)
  getSortKey(): string;
  // @virtual (undocumented)
  readonly kind: ApiItemKind;
  // @virtual
  readonly members: ReadonlyArray<ApiItem>;
  // WARNING: The type "IApiItemJson" needs to be exported by the package (e.g. added to index.ts)
  // @virtual (undocumented)
  static onDeserializeInto(options: Partial<IApiItemOptions>, jsonObject: IApiItemJson): void;
  // @virtual
  readonly parent: ApiItem | undefined;
  // WARNING: The type "IApiItemJson" needs to be exported by the package (e.g. added to index.ts)
  // @virtual (undocumented)
  serializeInto(jsonObject: Partial<IApiItemJson>): void;
}

// @public
interface ApiItemContainerMixin {
}

// @public
enum ApiItemKind {
  // (undocumented)
  CallSignature = "CallSignature",
  // (undocumented)
  Class = "Class",
  // (undocumented)
  Constructor = "Constructor",
  // (undocumented)
  ConstructSignature = "ConstructSignature",
  // (undocumented)
  EntryPoint = "EntryPoint",
  // (undocumented)
  Enum = "Enum",
  // (undocumented)
  EnumMember = "EnumMember",
  // (undocumented)
  Function = "Function",
  // (undocumented)
  IndexSignature = "IndexSignature",
  // (undocumented)
  Interface = "Interface",
  // (undocumented)
  Method = "Method",
  // (undocumented)
  MethodSignature = "MethodSignature",
  // (undocumented)
  Model = "Model",
  // (undocumented)
  Namespace = "Namespace",
  // (undocumented)
  None = "None",
  // (undocumented)
  Package = "Package",
  // (undocumented)
  Property = "Property",
  // (undocumented)
  PropertySignature = "PropertySignature",
  // (undocumented)
  TypeAlias = "TypeAlias",
  // (undocumented)
  Variable = "Variable"
}

// @public
class ApiMethod extends ApiMethod_base {
  constructor(options: IApiMethodOptions);
  // @override (undocumented)
  readonly canonicalReference: string;
  // (undocumented)
  static getCanonicalReference(name: string, isStatic: boolean, overloadIndex: number): string;
  // @override (undocumented)
  readonly kind: ApiItemKind;
}

// @public
class ApiMethodSignature extends ApiMethodSignature_base {
  constructor(options: IApiMethodSignatureOptions);
  // @override (undocumented)
  readonly canonicalReference: string;
  // (undocumented)
  static getCanonicalReference(name: string, overloadIndex: number): string;
  // @override (undocumented)
  readonly kind: ApiItemKind;
}

// @public
class ApiModel extends ApiModel_base {
  constructor();
  // @override (undocumented)
  addMember(member: ApiPackage): void;
  // @override (undocumented)
  readonly canonicalReference: string;
  // @override (undocumented)
  readonly kind: ApiItemKind;
  // (undocumented)
  loadPackage(apiJsonFilename: string): ApiPackage;
  // (undocumented)
  readonly packages: ReadonlyArray<ApiPackage>;
  // (undocumented)
  resolveDeclarationReference(declarationReference: DocDeclarationReference, contextApiItem: ApiItem | undefined): IResolveDeclarationReferenceResult;
  tryGetPackageByName(packageName: string): ApiPackage | undefined;
}

// @public
class ApiNamespace extends ApiNamespace_base {
  constructor(options: IApiNamespaceOptions);
  // @override (undocumented)
  readonly canonicalReference: string;
  // (undocumented)
  static getCanonicalReference(name: string): string;
  // @override (undocumented)
  readonly kind: ApiItemKind;
}

// @public
class ApiPackage extends ApiPackage_base {
  constructor(options: IApiPackageOptions);
  // @override (undocumented)
  addMember(member: ApiEntryPoint): void;
  // @override (undocumented)
  readonly canonicalReference: string;
  // (undocumented)
  readonly entryPoints: ReadonlyArray<ApiEntryPoint>;
  // (undocumented)
  findEntryPointsByPath(importPath: string): ReadonlyArray<ApiEntryPoint>;
  // @override (undocumented)
  readonly kind: ApiItemKind;
  // (undocumented)
  static loadFromJsonFile(apiJsonFilename: string): ApiPackage;
  // (undocumented)
  saveToJsonFile(apiJsonFilename: string, options?: IJsonFileSaveOptions): void;
}

// @public
interface ApiParameterListMixin {
}

// @public
class ApiProperty extends ApiProperty_base {
  constructor(options: IApiPropertyOptions);
  // @override (undocumented)
  readonly canonicalReference: string;
  // (undocumented)
  static getCanonicalReference(name: string, isStatic: boolean): string;
  // @override (undocumented)
  readonly kind: ApiItemKind;
}

// @public
class ApiPropertyItem extends ApiPropertyItem_base {
  constructor(options: IApiPropertyItemOptions);
  readonly isEventProperty: boolean;
  // WARNING: The type "IApiPropertyItemJson" needs to be exported by the package (e.g. added to index.ts)
  // @override (undocumented)
  static onDeserializeInto(options: Partial<IApiPropertyItemOptions>, jsonObject: IApiPropertyItemJson): void;
  readonly propertyTypeExcerpt: Excerpt;
  // WARNING: The type "IApiPropertyItemJson" needs to be exported by the package (e.g. added to index.ts)
  // @override (undocumented)
  serializeInto(jsonObject: Partial<IApiPropertyItemJson>): void;
}

// @public
class ApiPropertySignature extends ApiPropertyItem {
  constructor(options: IApiPropertySignatureOptions);
  // @override (undocumented)
  readonly canonicalReference: string;
  // (undocumented)
  static getCanonicalReference(name: string): string;
  // @override (undocumented)
  readonly kind: ApiItemKind;
}

// @public
interface ApiReleaseTagMixin {
}

// @public
interface ApiReturnTypeMixin {
}

// @public
interface ApiStaticMixin {
}

// @public
class ApiTypeAlias extends ApiTypeAlias_base {
  constructor(options: IApiTypeAliasOptions);
  // @override (undocumented)
  readonly canonicalReference: string;
  // (undocumented)
  static getCanonicalReference(name: string): string;
  // @override (undocumented)
  readonly kind: ApiItemKind;
}

// @public
class ApiVariable extends ApiVariable_base {
  constructor(options: IApiVariableOptions);
  // @override (undocumented)
  readonly canonicalReference: string;
  // (undocumented)
  static getCanonicalReference(name: string): string;
  // @override (undocumented)
  readonly kind: ApiItemKind;
  // WARNING: The type "IApiVariableJson" needs to be exported by the package (e.g. added to index.ts)
  // @override (undocumented)
  static onDeserializeInto(options: Partial<IApiVariableOptions>, jsonObject: IApiVariableJson): void;
  // WARNING: The type "IApiVariableJson" needs to be exported by the package (e.g. added to index.ts)
  // @override (undocumented)
  serializeInto(jsonObject: Partial<IApiVariableJson>): void;
  readonly variableTypeExcerpt: Excerpt;
}

// @public
class Excerpt {
  constructor(tokens: ReadonlyArray<ExcerptToken>, tokenRange: IExcerptTokenRange);
  // (undocumented)
  readonly text: string;
  // (undocumented)
  readonly tokenRange: Readonly<IExcerptTokenRange>;
  // (undocumented)
  readonly tokens: ReadonlyArray<ExcerptToken>;
}

// @public (undocumented)
class ExcerptToken {
  constructor(kind: ExcerptTokenKind, text: string);
  // (undocumented)
  readonly kind: ExcerptTokenKind;
  // (undocumented)
  readonly text: string;
}

// @public (undocumented)
enum ExcerptTokenKind {
  // (undocumented)
  Content = "Content",
  // (undocumented)
  Reference = "Reference"
}

// @public
class Extractor {
  constructor(config: IExtractorConfig, options?: IExtractorOptions);
  readonly actualConfig: IExtractorConfig;
  // @deprecated
  analyzeProject(options?: IAnalyzeProjectOptions): void;
  static generateFilePathsForAnalysis(inputFilePaths: string[]): string[];
  static jsonSchema: JsonSchema;
  static loadConfigObject(jsonConfigFile: string): IExtractorConfig;
  static readonly packageName: string;
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
class HeritageType {
  constructor(excerpt: Excerpt);
  readonly excerpt: Excerpt;
}

// @public
interface IAnalyzeProjectOptions {
  projectConfig?: IExtractorProjectConfig;
}

// @public
interface IApiCallSignatureOptions extends IApiParameterListMixinOptions, IApiReleaseTagMixinOptions, IApiReturnTypeMixinOptions, IApiDeclaredItemOptions {
}

// @public
interface IApiClassOptions extends IApiItemContainerMixinOptions, IApiNameMixinOptions, IApiReleaseTagMixinOptions, IApiDeclaredItemOptions {
  // (undocumented)
  extendsTokenRange: IExcerptTokenRange | undefined;
  // (undocumented)
  implementsTokenRanges: IExcerptTokenRange[];
}

// @public
interface IApiConstructorOptions extends IApiParameterListMixinOptions, IApiReleaseTagMixinOptions, IApiStaticMixinOptions, IApiDeclaredItemOptions {
}

// @public
interface IApiConstructSignatureOptions extends IApiParameterListMixinOptions, IApiReleaseTagMixinOptions, IApiReturnTypeMixinOptions, IApiDeclaredItemOptions {
}

// @public
interface IApiDeclaredItemOptions extends IApiDocumentedItemOptions {
  // (undocumented)
  excerptTokens: IExcerptToken[];
}

// @public
interface IApiDocumentedItemOptions extends IApiItemOptions {
  // (undocumented)
  docComment: tsdoc.DocComment | undefined;
}

// @public
interface IApiEntryPointOptions extends IApiItemContainerMixinOptions, IApiNameMixinOptions {
}

// @public
interface IApiEnumMemberOptions extends IApiNameMixinOptions, IApiReleaseTagMixinOptions, IApiDeclaredItemOptions {
  // (undocumented)
  initializerTokenRange: IExcerptTokenRange;
}

// @public
interface IApiEnumOptions extends IApiItemContainerMixinOptions, IApiNameMixinOptions, IApiReleaseTagMixinOptions, IApiDeclaredItemOptions {
}

// @public
interface IApiFunctionOptions extends IApiNameMixinOptions, IApiParameterListMixinOptions, IApiReleaseTagMixinOptions, IApiReturnTypeMixinOptions, IApiDeclaredItemOptions {
}

// @public
interface IApiIndexSignatureOptions extends IApiParameterListMixinOptions, IApiReleaseTagMixinOptions, IApiReturnTypeMixinOptions, IApiDeclaredItemOptions {
}

// @public
interface IApiInterfaceOptions extends IApiItemContainerMixinOptions, IApiNameMixinOptions, IApiReleaseTagMixinOptions, IApiDeclaredItemOptions {
  // (undocumented)
  extendsTokenRanges: IExcerptTokenRange[];
}

// @public
interface IApiItemContainerMixinOptions extends IApiItemOptions {
  // (undocumented)
  members?: ApiItem[];
}

// @public
interface IApiItemOptions {
}

// @public
interface IApiMethodOptions extends IApiNameMixinOptions, IApiParameterListMixinOptions, IApiReleaseTagMixinOptions, IApiReturnTypeMixinOptions, IApiStaticMixinOptions, IApiDeclaredItemOptions {
}

// @public (undocumented)
interface IApiMethodSignatureOptions extends IApiNameMixinOptions, IApiParameterListMixinOptions, IApiReleaseTagMixinOptions, IApiReturnTypeMixinOptions, IApiDeclaredItemOptions {
}

// @public
interface IApiNamespaceOptions extends IApiItemContainerMixinOptions, IApiNameMixinOptions, IApiReleaseTagMixinOptions, IApiDeclaredItemOptions {
}

// @public
interface IApiPackageOptions extends IApiItemContainerMixinOptions, IApiNameMixinOptions, IApiDocumentedItemOptions {
}

// @public
interface IApiParameterListMixinOptions extends IApiItemOptions {
  // (undocumented)
  overloadIndex: number;
  // (undocumented)
  parameters: IApiParameterOptions[];
}

// @public
interface IApiPropertyItemOptions extends IApiNameMixinOptions, IApiReleaseTagMixinOptions, IApiDeclaredItemOptions {
  // (undocumented)
  propertyTypeTokenRange: IExcerptTokenRange;
}

// @public
interface IApiPropertyOptions extends IApiPropertyItemOptions, IApiStaticMixinOptions {
}

// @public
interface IApiPropertySignatureOptions extends IApiPropertyItemOptions {
}

// @public
interface IApiReleaseTagMixinOptions extends IApiItemOptions {
  // (undocumented)
  releaseTag: ReleaseTag;
}

// @public
interface IApiReturnTypeMixinOptions extends IApiItemOptions {
  // (undocumented)
  returnTypeTokenRange: IExcerptTokenRange;
}

// @public
interface IApiStaticMixinOptions extends IApiItemOptions {
  // (undocumented)
  isStatic: boolean;
}

// @public
interface IApiTypeAliasOptions extends IApiNameMixinOptions, IApiReleaseTagMixinOptions, IApiDeclaredItemOptions {
}

// @public
interface IApiVariableOptions extends IApiNameMixinOptions, IApiReleaseTagMixinOptions, IApiDeclaredItemOptions {
  // (undocumented)
  variableTypeTokenRange: IExcerptTokenRange;
}

// @public (undocumented)
interface IExcerptToken {
  // (undocumented)
  readonly kind: ExcerptTokenKind;
  // (undocumented)
  text: string;
}

// @public (undocumented)
interface IExcerptTokenRange {
  // (undocumented)
  endIndex: number;
  // (undocumented)
  startIndex: number;
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
  extends?: string;
  policies?: IExtractorPoliciesConfig;
  project: IExtractorProjectConfig;
  // @beta
  tsdocMetadata?: IExtractorTsdocMetadataConfig;
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

// @beta
interface IExtractorTsdocMetadataConfig {
  enabled: boolean;
  tsdocMetadataPath?: string;
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

// @beta
class IndentedWriter {
  constructor(builder?: IStringBuilder);
  decreaseIndent(): void;
  defaultIndentPrefix: string;
  ensureNewLine(): void;
  ensureSkippedLine(): void;
  getText(): string;
  increaseIndent(indentPrefix?: string): void;
  indentScope(scope: () => void, indentPrefix?: string): void;
  peekLastCharacter(): string;
  peekSecondLastCharacter(): string;
  // (undocumented)
  toString(): string;
  write(message: string): void;
  writeLine(message?: string): void;
}

// @public
interface IParameterOptions {
  // (undocumented)
  name: string;
  // (undocumented)
  parameterTypeExcerpt: Excerpt;
  // (undocumented)
  parent: ApiParameterListMixin;
}

// @public
interface IResolveDeclarationReferenceResult {
  errorMessage: string | undefined;
  resolvedApiItem: ApiItem | undefined;
}

// WARNING: Unable to find referenced member "@microsoft/api-extractor#ApiParameterListMixin.parameters"
// @public
class Parameter {
  constructor(options: IParameterOptions);
  name: string;
  readonly parameterTypeExcerpt: Excerpt;
  readonly tsdocParamBlock: tsdoc.DocParamBlock | undefined;
}

// @public
enum ReleaseTag {
  Alpha = 2,
  Beta = 3,
  Internal = 1,
  None = 0,
  Public = 4
}

// WARNING: Unsupported export: Constructor
// WARNING: Unsupported export: PropertiesOf

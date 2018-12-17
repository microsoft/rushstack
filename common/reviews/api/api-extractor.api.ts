// @public
class ApiClass extends ApiClass_base {
  constructor(options: IApiClassOptions);
  // @override (undocumented)
  readonly canonicalReference: string;
  // (undocumented)
  readonly extendsType: HeritageType | undefined;
  // (undocumented)
  static getCanonicalReference(name: string): string;
  // (undocumented)
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
  static getCanonicalReference(name: string, isStatic: boolean, overloadIndex: number): string;
  // @override (undocumented)
  readonly kind: ApiItemKind;
}

// @public
class ApiConstructSignature extends ApiConstructSignature_base {
  constructor(options: IApiConstructSignatureOptions);
  // @override (undocumented)
  readonly canonicalReference: string;
  // (undocumented)
  static getCanonicalReference(name: string, overloadIndex: number): string;
  // @override (undocumented)
  readonly kind: ApiItemKind;
}

// @public
interface ApiDeclarationMixin {
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
  // (undocumented)
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
interface ApiFunctionLikeMixin {
}

// @public
class ApiInterface extends ApiInterface_base {
  constructor(options: IApiInterfaceOptions);
  // @override (undocumented)
  readonly canonicalReference: string;
  // (undocumented)
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
  getAssociatedPackage(): ApiPackage | undefined;
  getHierarchy(): ReadonlyArray<ApiItem>;
  getScopedNameWithinPackage(): string;
  // @virtual (undocumented)
  getSortKey(): string;
  // @virtual (undocumented)
  readonly kind: ApiItemKind;
  // @virtual
  readonly members: ReadonlyArray<ApiItem>;
  // (undocumented)
  readonly name: string;
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
  Parameter = "Parameter",
  // (undocumented)
  Property = "Property",
  // (undocumented)
  PropertySignature = "PropertySignature"
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

// WARNING: Unable to find referenced member "@microsoft/api-extractor#ApiFunctionLikeMixin.parameters"
// @public
class ApiParameter extends ApiParameter_base {
  constructor(options: IApiParameterOptions);
  // @override (undocumented)
  readonly canonicalReference: string;
  // @override (undocumented)
  readonly kind: ApiItemKind;
  // WARNING: The type "IApiParameterJson" needs to be exported by the package (e.g. added to index.ts)
  // @override (undocumented)
  static onDeserializeInto(options: Partial<IApiParameterOptions>, jsonObject: IApiParameterJson): void;
  // (undocumented)
  readonly parameterTypeExcerpt: Excerpt;
  // WARNING: The type "IApiParameterJson" needs to be exported by the package (e.g. added to index.ts)
  // @override (undocumented)
  serializeInto(jsonObject: Partial<IApiParameterJson>): void;
  readonly tsdocParamBlock: tsdoc.DocParamBlock | undefined;
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
interface IApiClassOptions extends IApiDeclarationMixinOptions, IApiItemContainerMixinOptions, IApiReleaseTagMixinOptions, IApiDocumentedItemOptions {
  // (undocumented)
  extendsTokenRange: IExcerptTokenRange | undefined;
  // (undocumented)
  implementsTokenRanges: IExcerptTokenRange[];
}

// @public
interface IApiConstructorOptions extends IApiDeclarationMixinOptions, IApiFunctionLikeMixinOptions, IApiReleaseTagMixinOptions, IApiStaticMixinOptions, IApiDocumentedItemOptions {
}

// @public
interface IApiConstructSignatureOptions extends IApiDeclarationMixinOptions, IApiFunctionLikeMixinOptions, IApiReleaseTagMixinOptions, IApiReturnTypeMixinOptions, IApiDocumentedItemOptions {
}

// @public
interface IApiDeclarationMixinOptions extends IApiItemOptions {
  // (undocumented)
  excerptTokens: IExcerptToken[];
}

// @public
interface IApiDocumentedItemOptions extends IApiItemOptions {
  // (undocumented)
  docComment: tsdoc.DocComment | undefined;
}

// @public
interface IApiEntryPointOptions extends IApiItemContainerMixinOptions {
}

// @public
interface IApiEnumMemberOptions extends IApiDeclarationMixinOptions, IApiReleaseTagMixinOptions, IApiDocumentedItemOptions {
  // (undocumented)
  initializerTokenRange: IExcerptTokenRange;
}

// @public
interface IApiEnumOptions extends IApiDeclarationMixinOptions, IApiItemContainerMixinOptions, IApiReleaseTagMixinOptions, IApiDocumentedItemOptions {
}

// @public
interface IApiFunctionLikeMixinOptions extends IApiItemOptions {
  // (undocumented)
  overloadIndex: number;
  // (undocumented)
  parameters?: ApiParameter[];
}

// @public
interface IApiFunctionOptions extends IApiDeclarationMixinOptions, IApiFunctionLikeMixinOptions, IApiReleaseTagMixinOptions, IApiReturnTypeMixinOptions, IApiDocumentedItemOptions {
}

// @public
interface IApiInterfaceOptions extends IApiDeclarationMixinOptions, IApiItemContainerMixinOptions, IApiReleaseTagMixinOptions, IApiDocumentedItemOptions {
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
  // (undocumented)
  name: string;
}

// @public
interface IApiMethodOptions extends IApiDeclarationMixinOptions, IApiFunctionLikeMixinOptions, IApiReleaseTagMixinOptions, IApiReturnTypeMixinOptions, IApiStaticMixinOptions, IApiDocumentedItemOptions {
}

// @public (undocumented)
interface IApiMethodSignatureOptions extends IApiDeclarationMixinOptions, IApiFunctionLikeMixinOptions, IApiReleaseTagMixinOptions, IApiReturnTypeMixinOptions, IApiDocumentedItemOptions {
}

// @public
interface IApiNamespaceOptions extends IApiDeclarationMixinOptions, IApiItemContainerMixinOptions, IApiReleaseTagMixinOptions, IApiDocumentedItemOptions {
}

// @public
interface IApiPackageOptions extends IApiItemContainerMixinOptions, IApiDocumentedItemOptions {
}

// @public
interface IApiParameterOptions extends IApiDeclarationMixinOptions, IApiItemOptions {
  // (undocumented)
  parameterTypeTokenRange: IExcerptTokenRange;
}

// @public
interface IApiPropertyItemOptions extends IApiDeclarationMixinOptions, IApiReleaseTagMixinOptions, IApiDocumentedItemOptions {
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
interface IResolveDeclarationReferenceResult {
  errorMessage: string | undefined;
  resolvedApiItem: ApiItem | undefined;
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

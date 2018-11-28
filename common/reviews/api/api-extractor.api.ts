// @public (undocumented)
class ApiClass extends ApiClass_base {
  constructor(options: IApiClassOptions);
  // @override (undocumented)
  readonly canonicalReference: string;
  // (undocumented)
  static getCanonicalReference(name: string): string;
  // @override (undocumented)
  readonly kind: ApiItemKind;
}

// @public (undocumented)
interface ApiDeclarationMixin {
}

// @public (undocumented)
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

// @public (undocumented)
class ApiEntryPoint extends ApiEntryPoint_base {
  constructor(options: IApiEntryPointOptions);
  // @override (undocumented)
  readonly canonicalReference: string;
  // @override (undocumented)
  readonly kind: ApiItemKind;
}

// @public (undocumented)
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

// @public (undocumented)
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
}

// @public (undocumented)
interface ApiFunctionLikeMixin {
}

// @public (undocumented)
class ApiInterface extends ApiInterface_base {
  constructor(options: IApiInterfaceOptions);
  // @override (undocumented)
  readonly canonicalReference: string;
  // (undocumented)
  static getCanonicalReference(name: string): string;
  // @override (undocumented)
  readonly kind: ApiItemKind;
}

// @public (undocumented)
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

// @public (undocumented)
interface ApiItemContainerMixin {
}

// @public (undocumented)
enum ApiItemKind {
  // (undocumented)
  Class = "Class",
  // (undocumented)
  EntryPoint = "EntryPoint",
  // (undocumented)
  Enum = "Enum",
  // (undocumented)
  EnumMember = "EnumMember",
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

// @public (undocumented)
class ApiMethod extends ApiMethod_base {
  constructor(options: IApiMethodOptions);
  // @override (undocumented)
  readonly canonicalReference: string;
  // (undocumented)
  static getCanonicalReference(name: string, isStatic: boolean, overloadIndex: number): string;
  // @override (undocumented)
  readonly kind: ApiItemKind;
  // (undocumented)
  readonly returnTypeExcerpt: Excerpt;
}

// @public (undocumented)
class ApiMethodSignature extends ApiMethodSignature_base {
  constructor(options: IApiMethodSignatureOptions);
  // @override (undocumented)
  readonly canonicalReference: string;
  // (undocumented)
  static getCanonicalReference(name: string, overloadIndex: number): string;
  // @override (undocumented)
  readonly kind: ApiItemKind;
  // (undocumented)
  readonly returnTypeExcerpt: Excerpt;
}

// @public (undocumented)
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

// @public (undocumented)
class ApiNamespace extends ApiNamespace_base {
  constructor(options: IApiNamespaceOptions);
  // @override (undocumented)
  readonly canonicalReference: string;
  // (undocumented)
  static getCanonicalReference(name: string): string;
  // @override (undocumented)
  readonly kind: ApiItemKind;
}

// @public (undocumented)
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

// @public (undocumented)
class ApiParameter extends ApiParameter_base {
  constructor(options: IApiParameterOptions);
  // @override (undocumented)
  readonly canonicalReference: string;
  // @override (undocumented)
  readonly kind: ApiItemKind;
  // (undocumented)
  readonly parameterTypeExcerpt: Excerpt;
  readonly tsdocParamBlock: tsdoc.DocParamBlock | undefined;
}

// @public (undocumented)
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
  // (undocumented)
  readonly propertyTypeExcerpt: Excerpt;
}

// @public (undocumented)
class ApiPropertySignature extends ApiPropertySignature_base {
  constructor(options: IApiPropertySignatureOptions);
  // @override (undocumented)
  readonly canonicalReference: string;
  // (undocumented)
  static getCanonicalReference(name: string): string;
  // @override (undocumented)
  readonly kind: ApiItemKind;
}

// @public (undocumented)
interface ApiReleaseTagMixin {
}

// @public (undocumented)
interface ApiStaticMixin {
}

// @public (undocumented)
class Excerpt {
  constructor(tokens: ReadonlyArray<ExcerptToken>, tokenRange: IExcerptTokenRange);
  // (undocumented)
  readonly text: string;
  // (undocumented)
  readonly tokenRange: IExcerptTokenRange;
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
interface IAnalyzeProjectOptions {
  projectConfig?: IExtractorProjectConfig;
}

// @public (undocumented)
interface IApiClassOptions extends IApiDeclarationMixinOptions, IApiItemContainerMixinOptions, IApiReleaseTagMixinOptions, IApiDocumentedItemOptions {
}

// @public (undocumented)
interface IApiDeclarationMixinOptions extends IApiItemOptions {
  // (undocumented)
  declarationExcerpt: IDeclarationExcerpt;
}

// @public (undocumented)
interface IApiDocumentedItemOptions extends IApiItemOptions {
  // (undocumented)
  docComment: tsdoc.DocComment | undefined;
}

// @public (undocumented)
interface IApiEntryPointOptions extends IApiItemContainerMixinOptions {
}

// @public (undocumented)
interface IApiEnumMemberOptions extends IApiDeclarationMixinOptions, IApiReleaseTagMixinOptions, IApiDocumentedItemOptions {
}

// @public (undocumented)
interface IApiEnumOptions extends IApiDeclarationMixinOptions, IApiItemContainerMixinOptions, IApiReleaseTagMixinOptions, IApiDocumentedItemOptions {
}

// @public (undocumented)
interface IApiFunctionLikeMixinOptions extends IApiItemOptions {
  // (undocumented)
  overloadIndex: number;
  // (undocumented)
  parameters?: ApiParameter[];
}

// @public (undocumented)
interface IApiInterfaceOptions extends IApiDeclarationMixinOptions, IApiItemContainerMixinOptions, IApiReleaseTagMixinOptions, IApiDocumentedItemOptions {
}

// @public (undocumented)
interface IApiItemContainerMixinOptions extends IApiItemOptions {
  // (undocumented)
  members?: ApiItem[];
}

// @public (undocumented)
interface IApiItemOptions {
  // (undocumented)
  name: string;
}

// @public (undocumented)
interface IApiMethodOptions extends IApiDeclarationMixinOptions, IApiFunctionLikeMixinOptions, IApiReleaseTagMixinOptions, IApiStaticMixinOptions, IApiDocumentedItemOptions {
}

// @public (undocumented)
interface IApiMethodSignatureOptions extends IApiDeclarationMixinOptions, IApiFunctionLikeMixinOptions, IApiReleaseTagMixinOptions, IApiDocumentedItemOptions {
}

// @public (undocumented)
interface IApiNamespaceOptions extends IApiDeclarationMixinOptions, IApiItemContainerMixinOptions, IApiReleaseTagMixinOptions, IApiDocumentedItemOptions {
}

// @public (undocumented)
interface IApiPackageOptions extends IApiItemContainerMixinOptions, IApiDocumentedItemOptions {
}

// @public (undocumented)
interface IApiParameterOptions extends IApiDeclarationMixinOptions, IApiItemOptions {
}

// @public (undocumented)
interface IApiPropertyItemOptions extends IApiDocumentedItemOptions, IApiDeclarationMixinOptions {
}

// @public (undocumented)
interface IApiPropertyOptions extends IApiReleaseTagMixinOptions, IApiStaticMixinOptions, IApiPropertyItemOptions {
}

// @public (undocumented)
interface IApiPropertySignatureOptions extends IApiReleaseTagMixinOptions, IApiPropertyItemOptions {
}

// @public (undocumented)
interface IApiReleaseTagMixinOptions extends IApiItemOptions {
  // (undocumented)
  releaseTag: ReleaseTag;
}

// @public (undocumented)
interface IApiStaticMixinOptions extends IApiItemOptions {
  // (undocumented)
  isStatic: boolean;
}

// @public (undocumented)
interface IDeclarationExcerpt {
  // (undocumented)
  embeddedExcerptsByName: {
    [name: string]: IExcerptTokenRange;
  }
  // (undocumented)
  excerptTokens: IExcerptToken[];
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
  readonly endIndex: number;
  // (undocumented)
  readonly startIndex: number;
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

// WARNING: Unsupported export: ExcerptName
// WARNING: Unsupported export: Constructor
// WARNING: Unsupported export: PropertiesOf

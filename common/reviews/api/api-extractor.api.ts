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
interface ApiDeclarationMixin extends ApiItem {
  // WARNING: The type "IApiItemJson" needs to be exported by the package (e.g. added to index.ts)
  // @override (undocumented)
  serializeInto(jsonObject: Partial<IApiItemJson>): void;
  // (undocumented)
  readonly signature: string;
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
interface ApiFunctionLikeMixin extends ApiItem {
  // (undocumented)
  addParameter(parameter: ApiParameter): void;
  // (undocumented)
  readonly overloadIndex: number;
  // (undocumented)
  readonly parameters: ReadonlyArray<ApiParameter>;
  // WARNING: The type "IApiItemJson" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  serializeInto(jsonObject: Partial<IApiItemJson>): void;
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
interface ApiItemContainerMixin extends ApiItem {
  // (undocumented)
  addMember(member: ApiItem): void;
  // (undocumented)
  readonly members: ReadonlyArray<ApiItem>;
  // WARNING: The type "IApiItemJson" needs to be exported by the package (e.g. added to index.ts)
  // @override (undocumented)
  serializeInto(jsonObject: Partial<IApiItemJson>): void;
  // (undocumented)
  tryGetMember(canonicalReference: string): ApiItem | undefined;
}

// @public (undocumented)
enum ApiItemKind {
  // (undocumented)
  Class = "Class",
  // (undocumented)
  EntryPoint = "EntryPoint",
  // (undocumented)
  Interface = "Interface",
  // (undocumented)
  Method = "Method",
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
}

// @public (undocumented)
class ApiModel extends ApiModel_base {
  constructor();
  // @override (undocumented)
  readonly canonicalReference: string;
  // @override (undocumented)
  readonly kind: ApiItemKind;
  // (undocumented)
  loadPackage(apiJsonFilename: string): ApiPackage;
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
  readonly canonicalReference: string;
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
  readonly tsdocParamBlock: tsdoc.DocParamBlock | undefined;
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
interface ApiStaticMixin extends ApiItem {
  // (undocumented)
  readonly isStatic: boolean;
  // WARNING: The type "IApiItemJson" needs to be exported by the package (e.g. added to index.ts)
  // @override (undocumented)
  serializeInto(jsonObject: Partial<IApiItemJson>): void;
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
interface IApiClassOptions extends IApiItemContainerMixinOptions, IApiDeclarationMixinOptions, IApiDocumentedItemOptions {
}

// @public (undocumented)
interface IApiDeclarationMixinOptions extends IApiItemOptions {
  // (undocumented)
  signature: string;
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
interface IApiFunctionLikeMixinOptions extends IApiItemOptions {
  // (undocumented)
  overloadIndex: number;
  // (undocumented)
  parameters?: ApiParameter[];
}

// @public (undocumented)
interface IApiInterfaceOptions extends IApiItemContainerMixinOptions, IApiDeclarationMixinOptions, IApiDocumentedItemOptions {
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
interface IApiMethodOptions extends IApiFunctionLikeMixinOptions, IApiStaticMixinOptions, IApiDeclarationMixinOptions, IApiDocumentedItemOptions {
}

// @public (undocumented)
interface IApiNamespaceOptions extends IApiItemContainerMixinOptions, IApiDeclarationMixinOptions, IApiDocumentedItemOptions {
}

// @public (undocumented)
interface IApiPackageOptions extends IApiItemContainerMixinOptions, IApiDocumentedItemOptions {
}

// @public (undocumented)
interface IApiParameterOptions extends IApiDeclarationMixinOptions {
}

// @public (undocumented)
interface IApiPropertySignatureOptions extends IApiDeclarationMixinOptions, IApiDocumentedItemOptions {
}

// @public (undocumented)
interface IApiStaticMixinOptions extends IApiItemOptions {
  // (undocumented)
  isStatic: boolean;
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

// WARNING: Unsupported export: Constructor
// WARNING: Unsupported export: PropertiesOf

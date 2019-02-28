// @public
declare class ApiCallSignature extends ApiCallSignature_base {
    // (undocumented)
    constructor(options: IApiCallSignatureOptions);
    // @override (undocumented)
    readonly canonicalReference: string;
    // (undocumented)
    static getCanonicalReference(overloadIndex: number): string;
    // @override (undocumented)
    readonly kind: ApiItemKind;
}

// @public
declare class ApiClass extends ApiClass_base {
    // (undocumented)
    constructor(options: IApiClassOptions);
    // @override (undocumented)
    readonly canonicalReference: string;
    readonly extendsType: HeritageType | undefined;
    // (undocumented)
    static getCanonicalReference(name: string): string;
    readonly implementsTypes: ReadonlyArray<HeritageType>;
    // @override (undocumented)
    readonly kind: ApiItemKind;
    // @override (undocumented)
    static onDeserializeInto(options: Partial<IApiClassOptions>, jsonObject: IApiClassJson): void;
    // @override (undocumented)
    serializeInto(jsonObject: Partial<IApiClassJson>): void;
}

// @public
declare class ApiConstructor extends ApiConstructor_base {
    // (undocumented)
    constructor(options: IApiConstructorOptions);
    // @override (undocumented)
    readonly canonicalReference: string;
    // (undocumented)
    static getCanonicalReference(isStatic: boolean, overloadIndex: number): string;
    // @override (undocumented)
    readonly kind: ApiItemKind;
}

// @public
declare class ApiConstructSignature extends ApiConstructSignature_base {
    // (undocumented)
    constructor(options: IApiConstructSignatureOptions);
    // @override (undocumented)
    readonly canonicalReference: string;
    // (undocumented)
    static getCanonicalReference(overloadIndex: number): string;
    // @override (undocumented)
    readonly kind: ApiItemKind;
}

// @public
declare class ApiDeclaredItem extends ApiDocumentedItem {
    // (undocumented)
    constructor(options: IApiDeclaredItemOptions);
    buildExcerpt(tokenRange: IExcerptTokenRange): Excerpt;
    readonly excerpt: Excerpt;
    readonly excerptTokens: ReadonlyArray<ExcerptToken>;
    getExcerptWithModifiers(): string;
    // @override (undocumented)
    static onDeserializeInto(options: Partial<IApiDeclaredItemOptions>, jsonObject: IApiDeclaredItemJson): void;
    // @override (undocumented)
    serializeInto(jsonObject: Partial<IApiDeclaredItemJson>): void;
}

// @public
declare class ApiDocumentedItem extends ApiItem {
    // (undocumented)
    constructor(options: IApiDocumentedItemOptions);
    // @override (undocumented)
    static onDeserializeInto(options: Partial<IApiDocumentedItemOptions>, jsonObject: IApiItemJson): void;
    // @override (undocumented)
    serializeInto(jsonObject: Partial<IApiDocumentedItemJson>): void;
    // (undocumented)
    readonly tsdocComment: tsdoc.DocComment | undefined;
    }

// @public
declare class ApiEntryPoint extends ApiEntryPoint_base {
    // (undocumented)
    constructor(options: IApiEntryPointOptions);
    // @override (undocumented)
    readonly canonicalReference: string;
    // @override (undocumented)
    readonly kind: ApiItemKind;
}

// @public
declare class ApiEnum extends ApiEnum_base {
    // (undocumented)
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
declare class ApiEnumMember extends ApiEnumMember_base {
    // (undocumented)
    constructor(options: IApiEnumMemberOptions);
    // @override (undocumented)
    readonly canonicalReference: string;
    // (undocumented)
    static getCanonicalReference(name: string): string;
    readonly initializerExcerpt: Excerpt;
    // @override (undocumented)
    readonly kind: ApiItemKind;
    // @override (undocumented)
    static onDeserializeInto(options: Partial<IApiEnumMemberOptions>, jsonObject: IApiEnumMemberJson): void;
    // @override (undocumented)
    serializeInto(jsonObject: Partial<IApiEnumMemberJson>): void;
}

// @public
declare class ApiFunction extends ApiFunction_base {
    // (undocumented)
    constructor(options: IApiFunctionOptions);
    // @override (undocumented)
    readonly canonicalReference: string;
    // (undocumented)
    static getCanonicalReference(name: string, overloadIndex: number): string;
    // @override (undocumented)
    readonly kind: ApiItemKind;
}

// @public
declare class ApiIndexSignature extends ApiIndexSignature_base {
    // (undocumented)
    constructor(options: IApiIndexSignatureOptions);
    // @override (undocumented)
    readonly canonicalReference: string;
    // (undocumented)
    static getCanonicalReference(overloadIndex: number): string;
    // @override (undocumented)
    readonly kind: ApiItemKind;
}

// @public
declare class ApiInterface extends ApiInterface_base {
    // (undocumented)
    constructor(options: IApiInterfaceOptions);
    // @override (undocumented)
    readonly canonicalReference: string;
    readonly extendsTypes: ReadonlyArray<HeritageType>;
    // (undocumented)
    static getCanonicalReference(name: string): string;
    // @override (undocumented)
    readonly kind: ApiItemKind;
    // @override (undocumented)
    static onDeserializeInto(options: Partial<IApiInterfaceOptions>, jsonObject: IApiInterfaceJson): void;
    // @override (undocumented)
    serializeInto(jsonObject: Partial<IApiInterfaceJson>): void;
}

// @public
declare class ApiItem {
    // (undocumented)
    [ApiItem_parent]: ApiItem | undefined;
    // (undocumented)
    constructor(options: IApiItemOptions);
    // @virtual (undocumented)
    readonly canonicalReference: string;
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
    // @virtual (undocumented)
    static onDeserializeInto(options: Partial<IApiItemOptions>, jsonObject: IApiItemJson): void;
    // @virtual
    readonly parent: ApiItem | undefined;
    // @virtual (undocumented)
    serializeInto(jsonObject: Partial<IApiItemJson>): void;
}

// @public
declare function ApiItemContainerMixin<TBaseClass extends IApiItemConstructor>(baseClass: TBaseClass): TBaseClass & (new (...args: any[]) => ApiItemContainerMixin);

// @public
interface ApiItemContainerMixin extends ApiItem {
    addMember(member: ApiItem): void;
    findMembersByName(name: string): ReadonlyArray<ApiItem>;
    readonly members: ReadonlyArray<ApiItem>;
    // @override (undocumented)
    serializeInto(jsonObject: Partial<IApiItemJson>): void;
    tryGetMember(canonicalReference: string): ApiItem | undefined;
}

// @public
declare namespace ApiItemContainerMixin {
    function isBaseClassOf(apiItem: ApiItem): apiItem is ApiItemContainerMixin;
}

// @public
declare const enum ApiItemKind {
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
declare class ApiMethod extends ApiMethod_base {
    // (undocumented)
    constructor(options: IApiMethodOptions);
    // @override (undocumented)
    readonly canonicalReference: string;
    // (undocumented)
    static getCanonicalReference(name: string, isStatic: boolean, overloadIndex: number): string;
    // @override (undocumented)
    readonly kind: ApiItemKind;
}

// @public
declare class ApiMethodSignature extends ApiMethodSignature_base {
    // (undocumented)
    constructor(options: IApiMethodSignatureOptions);
    // @override (undocumented)
    readonly canonicalReference: string;
    // (undocumented)
    static getCanonicalReference(name: string, overloadIndex: number): string;
    // @override (undocumented)
    readonly kind: ApiItemKind;
}

// @public
declare class ApiModel extends ApiModel_base {
    // (undocumented)
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
declare class ApiNamespace extends ApiNamespace_base {
    // (undocumented)
    constructor(options: IApiNamespaceOptions);
    // @override (undocumented)
    readonly canonicalReference: string;
    // (undocumented)
    static getCanonicalReference(name: string): string;
    // @override (undocumented)
    readonly kind: ApiItemKind;
}

// @public
declare class ApiPackage extends ApiPackage_base {
    // (undocumented)
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
    saveToJsonFile(apiJsonFilename: string, options?: IApiPackageSaveOptions): void;
}

// @public
declare function ApiParameterListMixin<TBaseClass extends IApiItemConstructor>(baseClass: TBaseClass): TBaseClass & (new (...args: any[]) => ApiParameterListMixin);

// @public
interface ApiParameterListMixin extends ApiItem {
    readonly overloadIndex: number;
    readonly parameters: ReadonlyArray<Parameter>;
    // (undocumented)
    serializeInto(jsonObject: Partial<IApiItemJson>): void;
}

// @public
declare namespace ApiParameterListMixin {
    function isBaseClassOf(apiItem: ApiItem): apiItem is ApiParameterListMixin;
}

// @public
declare class ApiProperty extends ApiProperty_base {
    // (undocumented)
    constructor(options: IApiPropertyOptions);
    // @override (undocumented)
    readonly canonicalReference: string;
    // (undocumented)
    static getCanonicalReference(name: string, isStatic: boolean): string;
    // @override (undocumented)
    readonly kind: ApiItemKind;
}

// @public
declare class ApiPropertyItem extends ApiPropertyItem_base {
    // (undocumented)
    constructor(options: IApiPropertyItemOptions);
    readonly isEventProperty: boolean;
    // @override (undocumented)
    static onDeserializeInto(options: Partial<IApiPropertyItemOptions>, jsonObject: IApiPropertyItemJson): void;
    readonly propertyTypeExcerpt: Excerpt;
    // @override (undocumented)
    serializeInto(jsonObject: Partial<IApiPropertyItemJson>): void;
}

// @public
declare class ApiPropertySignature extends ApiPropertyItem {
    // (undocumented)
    constructor(options: IApiPropertySignatureOptions);
    // @override (undocumented)
    readonly canonicalReference: string;
    // (undocumented)
    static getCanonicalReference(name: string): string;
    // @override (undocumented)
    readonly kind: ApiItemKind;
}

// @public
declare function ApiReleaseTagMixin<TBaseClass extends IApiItemConstructor>(baseClass: TBaseClass): TBaseClass & (new (...args: any[]) => ApiReleaseTagMixin);

// @public
interface ApiReleaseTagMixin extends ApiItem {
    readonly releaseTag: ReleaseTag;
    // @override (undocumented)
    serializeInto(jsonObject: Partial<IApiItemJson>): void;
}

// @public
declare namespace ApiReleaseTagMixin {
    function isBaseClassOf(apiItem: ApiItem): apiItem is ApiReleaseTagMixin;
}

// @public
declare function ApiReturnTypeMixin<TBaseClass extends IApiItemConstructor>(baseClass: TBaseClass): TBaseClass & (new (...args: any[]) => ApiReturnTypeMixin);

// @public
interface ApiReturnTypeMixin extends ApiItem {
    readonly returnTypeExcerpt: Excerpt;
    // @override (undocumented)
    serializeInto(jsonObject: Partial<IApiReturnTypeMixinJson>): void;
}

// @public
declare namespace ApiReturnTypeMixin {
    function isBaseClassOf(apiItem: ApiItem): apiItem is ApiReturnTypeMixin;
}

// @public
declare function ApiStaticMixin<TBaseClass extends IApiItemConstructor>(baseClass: TBaseClass): TBaseClass & (new (...args: any[]) => ApiStaticMixin);

// @public
interface ApiStaticMixin extends ApiItem {
    readonly isStatic: boolean;
    // @override (undocumented)
    serializeInto(jsonObject: Partial<IApiItemJson>): void;
}

// @public
declare namespace ApiStaticMixin {
    function isBaseClassOf(apiItem: ApiItem): apiItem is ApiStaticMixin;
}

// @public
declare class ApiTypeAlias extends ApiTypeAlias_base {
    // (undocumented)
    constructor(options: IApiTypeAliasOptions);
    // @override (undocumented)
    readonly canonicalReference: string;
    // (undocumented)
    static getCanonicalReference(name: string): string;
    // @override (undocumented)
    readonly kind: ApiItemKind;
}

// @public
declare class ApiVariable extends ApiVariable_base {
    // (undocumented)
    constructor(options: IApiVariableOptions);
    // @override (undocumented)
    readonly canonicalReference: string;
    // (undocumented)
    static getCanonicalReference(name: string): string;
    // @override (undocumented)
    readonly kind: ApiItemKind;
    // @override (undocumented)
    static onDeserializeInto(options: Partial<IApiVariableOptions>, jsonObject: IApiVariableJson): void;
    // @override (undocumented)
    serializeInto(jsonObject: Partial<IApiVariableJson>): void;
    readonly variableTypeExcerpt: Excerpt;
}

// @public (undocumented)
declare type Constructor<T = {}> = new (...args: any[]) => T;

// @public
declare class Excerpt {
    // (undocumented)
    constructor(tokens: ReadonlyArray<ExcerptToken>, tokenRange: IExcerptTokenRange);
    // (undocumented)
    readonly text: string;
    // (undocumented)
    readonly tokenRange: Readonly<IExcerptTokenRange>;
    // (undocumented)
    readonly tokens: ReadonlyArray<ExcerptToken>;
}

// @public (undocumented)
declare class ExcerptToken {
    // (undocumented)
    constructor(kind: ExcerptTokenKind, text: string);
    // (undocumented)
    readonly kind: ExcerptTokenKind;
    // (undocumented)
    readonly text: string;
    }

// @public (undocumented)
declare const enum ExcerptTokenKind {
    // (undocumented)
    Content = "Content",
    // (undocumented)
    Reference = "Reference"
}

// @public
declare class Extractor {
    // (undocumented)
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
declare class ExtractorMessage {
    // @internal (undocumented)
    constructor(options: IExtractorMessageOptions);
    readonly category: ExtractorMessageCategory;
    readonly messageId: tsdoc.TSDocMessageId | ExtractorMessageId | string;
    readonly sourceFileColumn: number | undefined;
    readonly sourceFileLine: number | undefined;
    readonly sourceFilePath: string | undefined;
    readonly text: string;
}

// @public
declare const enum ExtractorMessageCategory {
    Compiler = "Compiler",
    Extractor = "Extractor",
    TSDoc = "TSDoc"
}

// @public
declare const enum ExtractorMessageId {
    ExtraReleaseTag = "ae-extra-release-tag",
    InconsistentReleaseTags = "ae-inconsistent-release-tags",
    MisplacedPackageTag = "ae-misplaced-package-tag",
    MissingReleaseTag = "ae-missing-release-tag"
}

// @public
declare const enum ExtractorMessageLogLevel {
    Error = "Error",
    None = "None",
    Warning = "Warning"
}

// @public
declare const enum ExtractorValidationRulePolicy {
    allow = "allow",
    error = "error"
}

// @public
declare class HeritageType {
    // (undocumented)
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
interface IApiPackageSaveOptions extends IJsonFileSaveOptions {
    // (undocumented)
    testMode?: boolean;
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
    // (undocumented)
    apiJsonFile?: IExtractorApiJsonFileConfig;
    // (undocumented)
    apiReviewFile?: IExtractorApiReviewFileConfig;
    compiler: IExtractorTsconfigCompilerConfig | IExtractorRuntimeCompilerConfig;
    // @beta (undocumented)
    dtsRollup?: IExtractorDtsRollupConfig;
    extends?: string;
    // (undocumented)
    messages?: IExtractorMessagesConfig;
    // (undocumented)
    policies?: IExtractorPoliciesConfig;
    // (undocumented)
    project: IExtractorProjectConfig;
    skipLibCheck?: boolean;
    testMode?: boolean;
    // @beta (undocumented)
    tsdocMetadata?: IExtractorTsdocMetadataConfig;
    // (undocumented)
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
interface IExtractorMessageReportingRuleConfig {
    addToApiReviewFile: boolean;
    logLevel: ExtractorMessageLogLevel;
}

// @public
interface IExtractorMessageReportingTableConfig {
    [messageId: string]: IExtractorMessageReportingRuleConfig;
}

// @public
interface IExtractorMessagesConfig {
    compilerMessageReporting: IExtractorMessageReportingTableConfig;
    extractorMessageReporting: IExtractorMessageReportingTableConfig;
    tsdocMessageReporting: IExtractorMessageReportingTableConfig;
}

// @public
interface IExtractorOptions {
    compilerProgram?: ts.Program;
    customLogger?: Partial<ILogger>;
    localBuild?: boolean;
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
    overrideTsconfig?: {};
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
declare class IndentedWriter {
    // (undocumented)
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

// @public
declare class Parameter {
    // (undocumented)
    constructor(options: IParameterOptions);
    name: string;
    readonly parameterTypeExcerpt: Excerpt;
    readonly tsdocParamBlock: tsdoc.DocParamBlock | undefined;
}

// @public (undocumented)
declare type PropertiesOf<T> = {
    [K in keyof T]: T[K];
};

// @public
declare enum ReleaseTag {
    Alpha = 2,
    Beta = 3,
    Internal = 1,
    None = 0,
    Public = 4
}


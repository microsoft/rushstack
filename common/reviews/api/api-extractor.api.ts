// @public
class ApiFileGenerator extends ApiItemVisitor {
  // WARNING: The type "IndentedWriter" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  protected _indentedWriter: IndentedWriter;
  public static areEquivalentApiFileContents(actualFileContent: string, expectedFileContent: string): boolean;
  // (undocumented)
  public generateApiFileContent(extractor: Extractor): string;
  // WARNING: The type "ApiEnum" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  protected visitApiEnum(apiEnum: ApiEnum): void;
  // WARNING: The type "ApiEnumValue" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  protected visitApiEnumValue(apiEnumValue: ApiEnumValue): void;
  // WARNING: The type "ApiFunction" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  protected visitApiFunction(apiFunction: ApiFunction): void;
  // WARNING: The type "ApiMember" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  protected visitApiMember(apiMember: ApiMember): void;
  // WARNING: The type "ApiModuleVariable" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  protected visitApiModuleVariable(apiModuleVariable: ApiModuleVariable): void;
  // WARNING: The type "ApiNamespace" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  protected visitApiNamespace(apiNamespace: ApiNamespace): void;
  // WARNING: The type "ApiPackage" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  protected visitApiPackage(apiPackage: ApiPackage): void;
  // WARNING: The type "ApiParameter" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  protected visitApiParam(apiParam: ApiParameter): void;
  // WARNING: The type "ApiStructuredType" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  protected visitApiStructuredType(apiStructuredType: ApiStructuredType): void;
  public writeApiFile(reportFilename: string, extractor: Extractor): void;
}

// @public
class ApiJsonGenerator extends ApiItemVisitor {
  // (undocumented)
  protected jsonOutput: Object;
  // WARNING: The type "ApiItem" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  protected visit(apiItem: ApiItem, refObject?: Object): void;
  // WARNING: The type "ApiEnum" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  protected visitApiEnum(apiEnum: ApiEnum, refObject?: Object): void;
  // WARNING: The type "ApiEnumValue" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  protected visitApiEnumValue(apiEnumValue: ApiEnumValue, refObject?: Object): void;
  // WARNING: The type "ApiFunction" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  protected visitApiFunction(apiFunction: ApiFunction, refObject?: Object): void;
  // WARNING: The type "ApiMember" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  protected visitApiMember(apiMember: ApiMember, refObject?: Object): void;
  // WARNING: The type "ApiMethod" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  protected visitApiMethod(apiMethod: ApiMethod, refObject?: Object): void;
  // WARNING: The type "ApiModuleVariable" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  protected visitApiModuleVariable(apiModuleVariable: ApiModuleVariable, refObject?: Object): void;
  // WARNING: The type "ApiNamespace" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  protected visitApiNamespace(apiNamespace: ApiNamespace, refObject?: Object): void;
  // WARNING: The type "ApiPackage" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  protected visitApiPackage(apiPackage: ApiPackage, refObject?: Object): void;
  // WARNING: The type "ApiParameter" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  protected visitApiParam(apiParam: ApiParameter, refObject?: Object): void;
  // WARNING: The type "ApiProperty" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  protected visitApiProperty(apiProperty: ApiProperty, refObject?: Object): void;
  // WARNING: The type "ApiStructuredType" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  protected visitApiStructuredType(apiStructuredType: ApiStructuredType, refObject?: Object): void;
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
  // WARNING: The type "ApiPackage" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  public package: ApiPackage;
  public readonly packageFolder: string;
  // WARNING: The type "PackageJsonLookup" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  public packageJsonLookup: PackageJsonLookup;
  public reportError(message: string, sourceFile: ts.SourceFile, start: number): void;
  // (undocumented)
  public typeChecker: ts.TypeChecker;
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

// WARNING: Unsupported export: ApiErrorHandler

class Analyzer {
  // (undocumented)
  constructor(errorHandler?: ApiErrorHandler);
  public analyze(options: IApiAnalyzerOptions): void;
  public static defaultErrorHandler(message: string, fileName: string, lineNumber: number): void;
  public docItemLoader: DocItemLoader;
  // (undocumented)
  public errorHandler: ApiErrorHandler;
  // (undocumented)
  public package: ApiPackage;
  public reportError(message: string, sourceFile: ts.SourceFile, start: number): void;
  // (undocumented)
  public typeChecker: ts.TypeChecker;
}

class ApiFileGenerator extends ApiItemVisitor {
  // (undocumented)
  protected _indentedWriter: IndentedWriter;
  public static areEquivalentApiFileContents(actualFileContent: string, expectedFileContent: string): boolean;
  // (undocumented)
  public generateApiFileContent(analyzer: Analyzer): string;
  // (undocumented)
  protected visitApiEnum(apiEnum: ApiEnum): void;
  // (undocumented)
  protected visitApiEnumValue(apiEnumValue: ApiEnumValue): void;
  // (undocumented)
  protected visitApiFunction(apiFunction: ApiFunction): void;
  // (undocumented)
  protected visitApiMember(apiMember: ApiMember): void;
  // (undocumented)
  protected visitApiPackage(apiPackage: ApiPackage): void;
  // (undocumented)
  protected visitApiParam(apiParam: ApiParameter): void;
  // (undocumented)
  protected visitApiStructuredType(apiStructuredType: ApiStructuredType): void;
  public writeApiFile(reportFilename: string, analyzer: Analyzer): void;
}

class ApiJsonGenerator extends ApiItemVisitor {
  // (undocumented)
  protected apiTagsToSkip: ApiTag[];
  // (undocumented)
  protected jsonOutput: Object;
  // (undocumented)
  protected visitApiEnum(apiEnum: ApiEnum, refObject?: Object): void;
  // (undocumented)
  protected visitApiEnumValue(apiEnumValue: ApiEnumValue, refObject?: Object): void;
  // (undocumented)
  protected visitApiFunction(apiFunction: ApiFunction, refObject?: Object): void;
  // (undocumented)
  protected visitApiMember(apiMember: ApiMember, refObject?: Object): void;
  // (undocumented)
  protected visitApiMethod(apiMethod: ApiMethod, refObject?: Object): void;
  // (undocumented)
  protected visitApiPackage(apiPackage: ApiPackage, refObject?: Object): void;
  // (undocumented)
  protected visitApiParam(apiParam: ApiParameter, refObject?: Object): void;
  // (undocumented)
  protected visitApiProperty(apiProperty: ApiProperty, refObject?: Object): void;
  // (undocumented)
  protected visitApiStructuredType(apiStructuredType: ApiStructuredType, refObject?: Object): void;
  // (undocumented)
  public writeJsonFile(reportFilename: string, analyzer: Analyzer): void;
}

class ExternalApiHelper {
  public static generateApiJson(rootDir: string, libFolder: string, externalPackageFilePath: string): void;
}

interface IApiAnalyzerOptions {
  compilerOptions: ts.CompilerOptions;
  entryPointFile: string;
  otherFiles?: string[];
}

// WARNING: Unsupported export: ApiErrorHandler
// @public

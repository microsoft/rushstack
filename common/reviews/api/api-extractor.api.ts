// @public
class Extractor {
  constructor(config: IExtractorConfig, options?: IExtractorOptions);
  readonly actualConfig: IExtractorConfig;
  // @deprecated
  analyzeProject(options?: IAnalyzeProjectOptions): void;
  static generateFilePathsForAnalysis(inputFilePaths: string[]): string[];
  static jsonSchema: JsonSchema;
  processProject(options?: IAnalyzeProjectOptions): boolean;
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


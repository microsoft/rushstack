// @public (undocumented)
interface ITscCmdTaskConfig extends IBaseCmdTaskConfig {
  removeCommentsFromJavaScript?: boolean;
  staticMatch?: string[];
}

// @public (undocumented)
interface ITslintCmdTaskConfig extends IBaseCmdTaskConfig {
  customArgs?: string[];
  displayAsError?: boolean;
}

// @alpha (undocumented)
class TscCmdTask extends BaseCmdTask<ITscCmdTaskConfig> {
  constructor();
  // (undocumented)
  protected _onData(data: Buffer): void;
  // (undocumented)
  executeTask(gulp: Object, completeCallback: (error?: string) => void): Promise<void> | undefined;
  // (undocumented)
  loadSchema(): Object;
}

// @alpha (undocumented)
class TslintCmdTask extends BaseCmdTask<ITslintCmdTaskConfig> {
  constructor();
  // (undocumented)
  protected _getArgs(): string[];
  // (undocumented)
  protected _onClose(code: number, hasErrors: boolean, resolve: () => void, reject: (error: Error) => void): void;
  // (undocumented)
  protected _onData(data: Buffer): void;
  // (undocumented)
  executeTask(gulp: Object, completeCallback: (error?: string) => void): Promise<void> | undefined;
  // (undocumented)
  loadSchema(): Object;
}

// WARNING: Unsupported export: removeTripleSlash
// WARNING: Unsupported export: tscCmd
// WARNING: Unsupported export: tslintCmd
// WARNING: Unsupported export: apiExtractor
// (No @packagedocumentation comment for this package)

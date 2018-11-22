// @public (undocumented)
interface ITscCmdTaskConfig extends IRSCTaskConfig {
  removeCommentsFromJavaScript?: boolean;
  staticMatch?: string[];
}

// @public (undocumented)
interface ITslintCmdTaskConfig extends IRSCTaskConfig {
  displayAsError?: boolean;
}

// @beta (undocumented)
class TscCmdTask extends RSCTask<ITscCmdTaskConfig> {
  constructor();
  // (undocumented)
  protected _onData(data: Buffer): void;
  // (undocumented)
  executeTask(): Promise<void>;
  // (undocumented)
  loadSchema(): Object;
}

// @beta (undocumented)
class TslintCmdTask extends RSCTask<ITslintCmdTaskConfig> {
  constructor();
  // (undocumented)
  executeTask(): Promise<void>;
  // (undocumented)
  loadSchema(): Object;
}

// WARNING: Unsupported export: tscCmd
// WARNING: Unsupported export: tslintCmd
// WARNING: Unsupported export: apiExtractor
// (No @packagedocumentation comment for this package)

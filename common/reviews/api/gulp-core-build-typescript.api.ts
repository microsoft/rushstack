// @public (undocumented)
declare const apiExtractor: ApiExtractorTask;

// @public (undocumented)
interface ITscCmdTaskConfig extends IRSCTaskConfig {
    removeCommentsFromJavaScript?: boolean;
    staticMatch?: string[];
}

// @public (undocumented)
interface ITslintCmdTaskConfig extends IRSCTaskConfig {
    displayAsError?: boolean;
}

// @public (undocumented)
declare const tscCmd: TscCmdTask;

// @alpha (undocumented)
declare class TscCmdTask extends RSCTask<ITscCmdTaskConfig> {
    // (undocumented)
    constructor();
    // (undocumented)
    executeTask(): Promise<void>;
    // (undocumented)
    loadSchema(): Object;
    // (undocumented)
    protected _onData(data: Buffer): void;
    // (undocumented)
    private _removeComments;
}

// @public (undocumented)
declare const tslintCmd: TslintCmdTask;

// @alpha (undocumented)
declare class TslintCmdTask extends RSCTask<ITslintCmdTaskConfig> {
    // (undocumented)
    constructor();
    // (undocumented)
    executeTask(): Promise<void>;
    // (undocumented)
    loadSchema(): Object;
}


// (No @packageDocumentation comment for this package)

// Warning: (ae-forgotten-export) The symbol ApiExtractorTask needs to be exported from the entry point index.d.ts
// 
// @public (undocumented)
declare const apiExtractor: ApiExtractorTask;

// Warning: (ae-forgotten-export) The symbol IRSCTaskConfig needs to be exported from the entry point index.d.ts
// 
// @public (undocumented)
interface ITscCmdTaskConfig extends IRSCTaskConfig {
    customArgs?: string[];
    removeCommentsFromJavaScript?: boolean;
    staticMatch?: string[];
}

// @public (undocumented)
interface ITslintCmdTaskConfig extends IRSCTaskConfig {
    displayAsError?: boolean;
}

// @public (undocumented)
declare const tscCmd: TscCmdTask;

// Warning: (ae-forgotten-export) The symbol RSCTask needs to be exported from the entry point index.d.ts
// 
// @beta (undocumented)
declare class TscCmdTask extends RSCTask<ITscCmdTaskConfig> {
    // (undocumented)
    constructor();
    // (undocumented)
    executeTask(): Promise<void>;
    // (undocumented)
    loadSchema(): Object;
    // (undocumented)
    protected _onData(data: Buffer): void;
    }

// @public (undocumented)
declare const tslintCmd: TslintCmdTask;

// @beta (undocumented)
declare class TslintCmdTask extends RSCTask<ITslintCmdTaskConfig> {
    // (undocumented)
    constructor();
    // (undocumented)
    executeTask(): Promise<void>;
    // (undocumented)
    loadSchema(): Object;
}


// (No @packageDocumentation comment for this package)

// @beta
interface IRushellExecuteResult {
    value: string;
}

// @beta
declare class Rushell {
    // (undocumented)
    private _evaluateCommand;
    // (undocumented)
    private _evaluateNode;
    // (undocumented)
    execute(script: string): IRushellExecuteResult;
}


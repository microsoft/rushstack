// @beta
interface IRushellExecuteResult {
    value: string;
}

// @beta
declare class Rushell {
    // (undocumented)
    execute(script: string): IRushellExecuteResult;
}


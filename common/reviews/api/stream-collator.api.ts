// @public
declare class Interleaver {
    constructor();
    // (undocumented)
    private static _activeTask;
    private static _completeTask;
    private static _getTaskOutput;
    static registerTask(taskName: string, quietMode?: boolean): ITaskWriter;
    static reset(): void;
    static setStdOut(stdout: {
        // (undocumented)
        write: (text: string) => void;
    }): void;
    // (undocumented)
    private static _stdout;
    // (undocumented)
    private static _tasks;
    private static _writeAllCompletedTasks;
    private static _writeTask;
    private static _writeTaskOutput;
}

// @public
interface ITaskWriter {
    // (undocumented)
    close(): void;
    // (undocumented)
    getStdError(): string;
    // (undocumented)
    getStdOutput(): string;
    // (undocumented)
    write(data: string): void;
    // (undocumented)
    writeError(data: string): void;
    // (undocumented)
    writeLine(data: string): void;
}


// (No @packageDocumentation comment for this package)

// @public
declare class Interleaver {
    static registerTask(taskName: string, quietMode?: boolean): ITaskWriter;
    static reset(): void;
    static setStdOut(stdout: {
        // (undocumented)
        write: (text: string) => void;
    }): void;
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

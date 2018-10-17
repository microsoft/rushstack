// @public
class Interleaver {
  constructor();
  static registerTask(taskName: string, quietMode?: boolean): ITaskWriter;
  static reset(): void;
  static setStdOut(stdout: {
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

// (No @packagedocumentation comment for this package)

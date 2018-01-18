// @public
class DualTaskStream extends stream.Readable, implements NodeJS.ReadableStream, NodeJS.EventEmitter {
  constructor(quietMode?: boolean);
  // (undocumented)
  _read(): void;
  end(): void;
  // (undocumented)
  stderr: PersistentStream;
  // (undocumented)
  stdout: PersistentStream;
}

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

// @public
class PersistentStream extends stream.Transform {
  constructor(opts?: stream.TransformOptions);
  // (undocumented)
  _transform(chunk: Buffer | String, encoding: string, done: (err?: Object, data?: Object) => void): void;
  // (undocumented)
  readAll(): string;
}

// @public
class StreamCollator<T extends NodeJS.ReadableStream> extends Stream.Readable, implements NodeJS.ReadableStream {
  // (undocumented)
  _read(): void;
  register(stream: T): void;
}

// (No @packagedocumentation comment for this package)

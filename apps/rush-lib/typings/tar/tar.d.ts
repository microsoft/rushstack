/// <reference types="node" />

// incomplete types for tar@3.1.13

declare module 'tar' {
  namespace NodeTar {
    interface ICreateOptions {
      file?: string;
      sync?: boolean;
      onwarn?: (message: string, data: Object) => void;
      strict?: boolean;
      cwd?: string;
      prefix?: string;
      gzip?: boolean | Object;
      filter?: (path: string, stat: Object) => boolean;
      portable?: boolean;
      preservePaths?: boolean;
      mode?: Object;
      noDirRecurse?: boolean;
      follow?: boolean;
      noPax?: boolean;
    }

    interface IExtractOptions {
      cwd?: string;
      file?: string;
      sync?: boolean;
    }

    interface Tar {
      create(opts: NodeTar.ICreateOptions, fileList?: string[], cb?: () => void):
        undefined | NodeJS.ReadableStream | NodeJS.WritableStream;

      extract(opts: NodeTar.IExtractOptions): void;
    }
  }

  var tar: NodeTar.Tar;
  export = tar;
}
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

    interface Tar {
       c(opts: NodeTar.ICreateOptions, fileList: string[], cb?: () => void): undefined | NodeJS.ReadableStream;
    }
  }

  var tar: NodeTar.Tar;
  export = tar;
}
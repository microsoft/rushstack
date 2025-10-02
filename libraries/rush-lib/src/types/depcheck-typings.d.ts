declare function depcheck(rootDir: string, options: depcheck.Options): Promise<depcheck.Results>;

declare function depcheck<T>(
  rootDir: string,
  options: depcheck.Options,
  callback: (results: depcheck.Results) => T
): Promise<T>;

declare namespace depcheck {
  type Node = Record<string, any>;

  type Parser = (filePath: string, deps: ReadonlyArray<string>, rootDir: string) => Node | string[];

  type Detector = (node: Node) => ReadonlyArray<string> | string;

  interface PackageDependencies {
    [dependencyName: string]: string;
  }

  interface Options {
    ignoreBinPackage?: boolean;
    skipMissing?: boolean;
    ignoreMatches?: ReadonlyArray<string>;
    ignoreDirs?: ReadonlyArray<string>;
    ignorePath?: string;
    ignorePatterns?: ReadonlyArray<string>;
    package?: {
      dependencies?: PackageDependencies;
      devDependencies?: PackageDependencies;
      peerDependencies?: PackageDependencies;
      optionalDependencies?: PackageDependencies;
    };
    parsers?: {
      [match: string]: Parser;
    };
    detectors?: ReadonlyArray<Detector>;
    specials?: ReadonlyArray<Parser>;
  }

  interface Config {
    ignoreBinPackage?: Options['ignoreBinPackage'];
    skipMissing?: Options['skipMissing'];
    json?: boolean;
    ignores?: Options['ignoreMatches'];
    ignoreDirs?: Options['ignoreDirs'];
    ignorePath?: Options['ignorePath'];
    ignorePatterns?: Options['ignorePatterns'];
    parsers?: { [match: string]: keyof typeof parser | ReadonlyArray<keyof typeof parser> };
    detectors?: ReadonlyArray<keyof typeof detector>;
    specials?: ReadonlyArray<keyof typeof special>;
  }

  interface Results {
    dependencies: string[];
    devDependencies: string[];
    using: {
      [dependencyName: string]: string[];
    };
    missing: {
      [dependencyName: string]: string[];
    };
    invalidFiles: {
      [filePath: string]: any;
    };
    invalidDirs: {
      [filePath: string]: any;
    };
  }
}

export = depcheck;

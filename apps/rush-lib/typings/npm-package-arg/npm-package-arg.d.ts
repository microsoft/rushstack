// Type definitions for npm-package-arg 5.1.2
// Project: https://github.com/npm/npm-package-arg
// Definitions by: pgonzal

declare module 'npm-package-arg' {
  namespace npmPackageArg {
    type SpecType = 'git' | 'tag' | 'version' | 'range' | 'file' | 'directory' | 'remote' | 'alias';

    interface IResult {
      /**
       * Indicates the type of dependency reference.  For example 'version' indicates
       * a normal SemVer pattern.  See the package README.md for full docs.
       *
       * git - a git repository
       * tag - a tagged version, e.g. "example@latest"
       * version - A specific version number, e.g. "example@1.2.3"
       * range - A version range, e.g. "example@2.x"
       * file - A local .tar.gz, .tar or .tgz file
       * directory - A local directory
       * remote - An HTTP url to a .tar.gz, .tar or .tgz file
       * alias - A package alias such as "npm:other-package@^1.2.3"
       */
      type: SpecType;

      /**
       * True for tag, version and range types.
       */
      registry: boolean | undefined;

      /**
       * If known, the "name" field expected in the package.
       */
      name: string | null;

      /**
       * For scoped NPM packages, the scope name; otherwise the value will be null.
       */
      scope: string | null | undefined;

      /**
       * An escaped name for use when making requests to the NPM registry.
       */
      escapedName: string | null;

      /**
       * The original specifier passed to npmPackageArg.resolve(), or the specifier part of the
       * argument for npmPackageArg().
       */
      rawSpec: string;

      /**
       * The specifier, as normalized by NPM for saving in a package.json file.
       */
      saveSpec: string | null;

      /**
       * The specifier, as normalized by NPM for fetching a resource.  For example, a "directory"
       * type dependency, this will be the folder path.
       */
      fetchSpec: string | null;

      /**
       * For Git dependencies, if the committish includes a "semver:" prefix, then this is
       * the range part.
       * Example: For "mochajs/mocha#semver:1.2.3", the value would be "1.2.3"
       */
      gitRange: string | null | undefined;

      /**
       * For Git dependencies, the committish part of the specifier, or "master" if omitted.
       * Example: For "mochajs/mocha#4727d357ea", the value would be "4727d357ea"
       */
      gitCommittish: string | null | undefined;

      /**
       * The original input that was provided.  For npmPackageArg.resolve(), the name and
       * spec parameters will be combined, e.g. "example" and "1.2" will be combined as "example@1.2".
       */
      raw: string;

      /**
       * The parsed result for the alias target.
       * For example `other-package@^1.2.3` from `npm:other-package@^1.2.3`
       */
      subSpec: IResult | undefined;
    }

    /**
     * Parses a package dependency, based on a package name and version specifier as might appear
     * in a package.json file.  An Error object will be thrown if the input is invalid.
     *
     * @param name - The name of an NPM package, possibly including a scope
     * @param spec - A version specifier, e.g. "^1.2.3", "git://github.com/user/project.git#commit-ish", etc.
     * @param where - a path that file paths will be resolved relative to; otherwise, process.cwd()
     *   is used
     * @returns an object containing parsed information.
     *
     * @see {@link https://docs.npmjs.com/files/package.json#dependencies} for full syntax.
     */
    function resolve(name: string, spec: string, where?: string): npmPackageArg.IResult;
  }

  /**
   * Parses a package dependency, based on a combined package name and version specifier
   * as might be passed to "npm install".  An Error object will be thrown if the input is invalid.
   *
   * @param arg - a string such as "example@1.2", "bitbucket:user/example", "file:../example", etc.
   * @param where - a path that file paths will be resolved relative to; otherwise, process.cwd()
   *   is used
   * @returns an object containing parsed information.
   *
   * @see {@link https://docs.npmjs.com/files/package.json#dependencies} for full syntax.
   */
  function npmPackageArg(arg: string, where?: string): npmPackageArg.IResult;

  export = npmPackageArg;
}

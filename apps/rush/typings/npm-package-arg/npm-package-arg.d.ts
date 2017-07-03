// Type definitions for npm-package-arg 5.1.2
// Project: https://github.com/npm/npm-package-arg
// Definitions by: pgonzal

declare module 'npm-package-arg' {
  namespace npmPackageArg {
    interface IResult {
      /**
       * Indicates the type of dependency reference.  For example 'version' indicates
       * a normal SemVer pattern.  See the package README.md for full docs.
       */
      type: 'git' | 'tag' | 'version' | 'range' | 'file' | 'directory' | 'remote';
      /**
       * True for tag, version and range types.
       */
      registry: boolean;
      /**
       * If known, the "name" field expected in the resulting package.
       */
      name: string | null;
      /**
       * For scoped NPM packages, the scope name.
       */
      scope: string | null;

      escapedName: string | null;

      /**
       * The original specifier passed to npmPackageArg.resolve(), or the specifier part of the
       * argument for npmPackageArg().
       */
      rawSpec: string;

      /**
       * The normalized specifier.
       */
      saveSpec: string | null;

      fetchSpec: string | null;

      /**
       * If set, this is a semver specifier to match against git tags with
       */
      gitRange: string | null;

      /**
       * If set, this is the specific committish to use with a git dependency.
       */
      gitCommittish: string | null;

      hosted: string | null;

      raw: string | null;
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

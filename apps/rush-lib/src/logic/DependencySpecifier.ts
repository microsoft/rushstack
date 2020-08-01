// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// eslint-disable-next-line
const importLazy = require('import-lazy')(require);

console.log('DependencySpecifier.ts  : 1: ' + (new Date().getTime() % 20000) / 1000.0);
import npmPackageArg = require('npm-package-arg');
console.log('DependencySpecifier.ts  : 2: ' + (new Date().getTime() % 20000) / 1000.0);
// import { InternalError } from '@rushstack/node-core-library';
const nodeCoreLibrary = importLazy('@rushstack/node-core-library/lib/InternalError');
console.log('DependencySpecifier.ts  : 3: ' + (new Date().getTime() % 20000) / 1000.0);

/**
 * The parsed format of a provided version specifier.
 */
export enum DependencySpecifierType {
  /**
   * A git repository
   */
  Git = 'Git',

  /**
   * A tagged version, e.g. "example@latest"
   */
  Tag = 'Tag',

  /**
   * A specific version number, e.g. "example@1.2.3"
   */
  Version = 'Version',

  /**
   * A version range, e.g. "example@2.x"
   */
  Range = 'Range',

  /**
   * A local .tar.gz, .tar or .tgz file
   */
  File = 'File',

  /**
   * A local directory
   */
  Directory = 'Directory',

  /**
   * An HTTP url to a .tar.gz, .tar or .tgz file
   */
  Remote = 'Remote',

  /**
   * A package alias, e.g. "npm:other-package@^1.2.3"
   */
  Alias = 'Alias',

  /**
   * A package specified using workspace protocol, e.g. "workspace:^1.2.3"
   */
  Workspace = 'Workspace'
}

/**
 * An NPM "version specifier" is a string that can appear as a package.json "dependencies" value.
 * Example version specifiers: `^1.2.3`, `file:./blah.tgz`, `npm:other-package@~1.2.3`, and so forth.
 * A "dependency specifier" is the version specifier information, combined with the dependency package name.
 */
export class DependencySpecifier {
  /**
   * The dependency package name, i.e. the key from a "dependencies" key/value table.
   */
  public readonly packageName: string;

  /**
   * The dependency version specifier, i.e. the value from a "dependencies" key/value table.
   * Example values: `^1.2.3`, `file:./blah.tgz`, `npm:other-package@~1.2.3`
   */
  public readonly versionSpecifier: string;

  /**
   * The type of the `versionSpecifier`.
   */
  public readonly specifierType: DependencySpecifierType;

  /**
   * If `specifierType` is `alias`, then this is the parsed target dependency.
   * For example, if version specifier i `"npm:other-package@^1.2.3"` then this is the parsed object for
   * `other-package@^1.2.3`.
   */
  public readonly aliasTarget: DependencySpecifier | undefined;

  public constructor(packageName: string, versionSpecifier: string) {
    this.packageName = packageName;
    this.versionSpecifier = versionSpecifier;

    // Workspace ranges are a feature from PNPM and Yarn. Set the version specifier
    // to the trimmed version range.
    if (versionSpecifier.startsWith('workspace:')) {
      this.specifierType = DependencySpecifierType.Workspace;
      this.versionSpecifier = versionSpecifier.slice(this.specifierType.length + 1).trim();
      this.aliasTarget = undefined;
      return;
    }

    const result: npmPackageArg.Result = npmPackageArg.resolve(packageName, versionSpecifier);
    this.specifierType = DependencySpecifier.getDependencySpecifierType(result.type);

    if (this.specifierType === DependencySpecifierType.Alias) {
      const aliasResult: npmPackageArg.AliasResult = result as npmPackageArg.AliasResult;
      if (!aliasResult.subSpec || !aliasResult.subSpec.name) {
        throw new nodeCoreLibrary.InternalError('Unexpected result from npm-package-arg');
      }
      this.aliasTarget = new DependencySpecifier(aliasResult.subSpec.name, aliasResult.subSpec.rawSpec);
    } else {
      this.aliasTarget = undefined;
    }
  }

  public static getDependencySpecifierType(specifierType: string): DependencySpecifierType {
    switch (specifierType) {
      case 'git':
        return DependencySpecifierType.Git;
      case 'tag':
        return DependencySpecifierType.Tag;
      case 'version':
        return DependencySpecifierType.Version;
      case 'range':
        return DependencySpecifierType.Range;
      case 'file':
        return DependencySpecifierType.File;
      case 'directory':
        return DependencySpecifierType.Directory;
      case 'remote':
        return DependencySpecifierType.Remote;
      case 'alias':
        return DependencySpecifierType.Alias;
      default:
        throw new nodeCoreLibrary.InternalError(`Unexpected npm-package-arg result type "${specifierType}"`);
    }
  }
}

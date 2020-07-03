// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import npmPackageArg = require('npm-package-arg');
import { InternalError } from '@rushstack/node-core-library';

/**
 * The parsed format of a provided version specifier.
 */
export const enum SpecifierType {
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
  public readonly specifierType: SpecifierType;

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
      this.specifierType = SpecifierType.Workspace;
      this.versionSpecifier = versionSpecifier.slice(this.specifierType.length + 1).trim();
      this.aliasTarget = undefined;
      return;
    }

    const result: npmPackageArg.Result = npmPackageArg.resolve(packageName, versionSpecifier);
    switch (result.type) {
      case 'git':
        this.specifierType = SpecifierType.Git;
        break;
      case 'tag':
        this.specifierType = SpecifierType.Tag;
        break;
      case 'version':
        this.specifierType = SpecifierType.Version;
        break;
      case 'range':
        this.specifierType = SpecifierType.Range;
        break;
      case 'file':
        this.specifierType = SpecifierType.File;
        break;
      case 'directory':
        this.specifierType = SpecifierType.Directory;
        break;
      case 'remote':
        this.specifierType = SpecifierType.Remote;
        break;
      case 'alias':
        this.specifierType = SpecifierType.Alias;
        break;
      default:
        throw new InternalError(`Unexpected npm-package-arg result type "${result.type}"`);
    }

    if (this.specifierType === SpecifierType.Alias) {
      const aliasResult: npmPackageArg.AliasResult = result as npmPackageArg.AliasResult;
      if (!aliasResult.subSpec || !aliasResult.subSpec.name) {
        throw new InternalError('Unexpected result from npm-package-arg');
      }
      this.aliasTarget = new DependencySpecifier(aliasResult.subSpec.name, aliasResult.subSpec.rawSpec);
    } else {
      this.aliasTarget = undefined;
    }
  }
}

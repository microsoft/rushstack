// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import npmPackageArg = require('npm-package-arg');
import { InternalError } from '@microsoft/node-core-library';

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
   * The type of `versionSpecifier`:
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
  public readonly specifierType: string;

  /**
   * If `specifierType` is `alias`, then this is the parsed target dependency.
   * For example, if version specifier i `"npm:other-package@^1.2.3"` then this is the parsed object for
   * `other-package@^1.2.3`.
   */
  public readonly aliasTarget: DependencySpecifier | undefined;

  public constructor(packageName: string, versionSpecifier: string) {
    this.packageName = packageName;
    this.versionSpecifier = versionSpecifier;

    const result: npmPackageArg.AliasResult = npmPackageArg.resolve(
      packageName,
      versionSpecifier
    ) as npmPackageArg.AliasResult;

    this.specifierType = result.type;

    if (result.type === 'alias') {
      if (!result.subSpec || !result.subSpec.name) {
        throw new InternalError('Unexpected result from npm-package-arg');
      }
      this.aliasTarget = new DependencySpecifier(result.subSpec.name, result.subSpec.rawSpec);
    } else {
      this.aliasTarget = undefined;
    }
  }
}

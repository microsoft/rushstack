// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import npmPackageArg = require('npm-package-arg');

/**
 * An NPM "version specifier" is a string that can appear as a package.json "dependencies" value.
 * Example version specifiers: `^1.2.3`, `file:./blah.tgz`, `npm:other-package@~1.2.3`, and so forth.
 * A "dependency specifier" is the version specifier information, combined with the dependency package name.
 */
export class DependencySpecifier {
  public readonly packageName: string;

  public readonly versionSpecifier: string;

  public readonly specifierType: npmPackageArg.SpecType;

  public constructor(packageName: string, versionSpecifier: string) {
    this.versionSpecifier = versionSpecifier;
    this.packageName = packageName;

    const result: npmPackageArg.IResult = npmPackageArg.resolve(packageName, versionSpecifier);

    this.specifierType = result.type;
  }
}

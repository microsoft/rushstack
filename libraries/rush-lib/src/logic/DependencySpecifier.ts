// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import npmPackageArg from 'npm-package-arg';

import { InternalError } from '@rushstack/node-core-library';

/**
 * match workspace protocol in dependencies value declaration in `package.json`
 * example:
 * `"workspace:*"`
 * `"workspace:alias@1.2.3"`
 */
const WORKSPACE_PREFIX_REGEX: RegExp = /^workspace:((?<alias>[^._/][^@]*)@)?(?<version>.*)$/;

/**
 * match catalog protocol in dependencies value declaration in `package.json`
 * example:
 * `"catalog:"` - uses the default catalog
 * `"catalog:react18"` - uses the named catalog "react18"
 */
const CATALOG_PREFIX_REGEX: RegExp = /^catalog:(?<catalogName>.*)$/;

/**
 * resolve workspace protocol(from `@pnpm/workspace.spec-parser`).
 * used by pnpm. see [pkgs-graph](https://github.com/pnpm/pnpm/blob/27c33f0319f86c45c1645d064cd9c28aada80780/workspace/pkgs-graph/src/index.ts#L49)
 */
class WorkspaceSpec {
  public readonly alias?: string;
  public readonly version: string;
  public readonly versionSpecifier: string;

  public constructor(version: string, alias?: string) {
    this.version = version;
    this.alias = alias;
    this.versionSpecifier = alias ? `${alias}@${version}` : version;
  }

  public static tryParse(pref: string): WorkspaceSpec | undefined {
    const parts: RegExpExecArray | null = WORKSPACE_PREFIX_REGEX.exec(pref);
    if (parts?.groups) {
      return new WorkspaceSpec(parts.groups.version, parts.groups.alias);
    }
  }

  public toString(): `workspace:${string}` {
    return `workspace:${this.versionSpecifier}`;
  }
}

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
  Workspace = 'Workspace',

  /**
   * A package specified using catalog protocol, e.g. "catalog:" or "catalog:react18"
   */
  Catalog = 'Catalog'
}

const dependencySpecifierParseCache: Map<string, DependencySpecifier> = new Map();

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

  /**
   * If `specifierType` is `Catalog`, then this is the catalog name.
   * For example, if version specifier is `"catalog:react18"` then this is `"react18"`.
   * If version specifier is `"catalog:"` (default catalog), then this is `"default"`.
   */
  public readonly catalogName: string | undefined;

  public constructor(packageName: string, versionSpecifier: string) {
    this.packageName = packageName;
    this.versionSpecifier = versionSpecifier;

    // Catalog protocol is a PNPM feature. Parse the catalog name.
    const catalogMatch: RegExpExecArray | null = CATALOG_PREFIX_REGEX.exec(versionSpecifier);
    if (catalogMatch?.groups) {
      this.specifierType = DependencySpecifierType.Catalog;
      // If no catalog name is provided, use "default"
      this.catalogName = catalogMatch.groups.catalogName || 'default';
      this.aliasTarget = undefined;
      return;
    }

    // Workspace ranges are a feature from PNPM and Yarn. Set the version specifier
    // to the trimmed version range.
    const workspaceSpecResult: WorkspaceSpec | undefined = WorkspaceSpec.tryParse(versionSpecifier);
    if (workspaceSpecResult) {
      this.catalogName = undefined;
      this.specifierType = DependencySpecifierType.Workspace;
      this.versionSpecifier = workspaceSpecResult.versionSpecifier;

      if (workspaceSpecResult.alias) {
        // "workspace:some-package@^1.2.3" should be resolved as alias
        this.aliasTarget = DependencySpecifier.parseWithCache(
          workspaceSpecResult.alias,
          workspaceSpecResult.version
        );
      } else {
        this.aliasTarget = undefined;
      }

      return;
    }

    this.catalogName = undefined;

    const result: npmPackageArg.Result = npmPackageArg.resolve(packageName, versionSpecifier);
    this.specifierType = DependencySpecifier.getDependencySpecifierType(result.type);

    if (this.specifierType === DependencySpecifierType.Alias) {
      const aliasResult: npmPackageArg.AliasResult = result as npmPackageArg.AliasResult;
      if (!aliasResult.subSpec || !aliasResult.subSpec.name) {
        throw new InternalError('Unexpected result from npm-package-arg');
      }
      this.aliasTarget = DependencySpecifier.parseWithCache(
        aliasResult.subSpec.name,
        aliasResult.subSpec.rawSpec
      );
    } else {
      this.aliasTarget = undefined;
    }
  }

  /**
   * Clears the dependency specifier parse cache.
   */
  public static clearCache(): void {
    dependencySpecifierParseCache.clear();
  }

  /**
   * Parses a dependency specifier with caching.
   * @param packageName - The name of the package the version specifier corresponds to
   * @param versionSpecifier - The version specifier to parse
   * @returns The parsed dependency specifier
   */
  public static parseWithCache(packageName: string, versionSpecifier: string): DependencySpecifier {
    const cacheKey: string = `${packageName}\0${versionSpecifier}`;
    let result: DependencySpecifier | undefined = dependencySpecifierParseCache.get(cacheKey);
    if (!result) {
      result = new DependencySpecifier(packageName, versionSpecifier);
      dependencySpecifierParseCache.set(cacheKey, result);
    }
    return result;
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
        throw new InternalError(`Unexpected npm-package-arg result type "${specifierType}"`);
    }
  }
}

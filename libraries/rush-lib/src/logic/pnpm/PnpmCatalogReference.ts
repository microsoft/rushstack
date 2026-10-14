// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { PnpmCatalogs } from './EffectivePnpmOptions';

/**
 * The prefix of a version specifier that references a PNPM catalog, e.g. `catalog:` or `catalog:tools`.
 */
export const PNPM_CATALOG_PROTOCOL: 'catalog:' = 'catalog:';

/**
 * The name of the catalog that `catalog:` refers to.
 */
export const DEFAULT_PNPM_CATALOG_NAME: 'default' = 'default';

/**
 * A package.json version specifier that references a PNPM catalog, and the catalog entry it resolves to.
 */
export interface IPnpmCatalogReference {
  /**
   * The normalized name of the referenced catalog. Both `catalog:` and `catalog:default` reference
   * the catalog named `default`.
   */
  readonly catalogName: string;

  /**
   * The version specifier from the catalog entry for the package, for example `~5.8.2`.
   * This is `undefined` if the referenced catalog does not exist or does not have an entry for the package.
   * PNPM reports an error for such references when it installs.
   */
  readonly resolvedVersion: string | undefined;
}

/**
 * If the version specifier references a PNPM catalog, returns the normalized name of the catalog.
 * Otherwise, returns `undefined`.
 *
 * @remarks
 * This matches how PNPM parses the catalog protocol: the catalog name is trimmed, and `catalog:`
 * (with an empty name) references the `default` catalog, the same as `catalog:default`.
 */
export function tryParsePnpmCatalogName(versionSpecifier: string): string | undefined {
  if (!versionSpecifier.startsWith(PNPM_CATALOG_PROTOCOL)) {
    return undefined;
  }

  const catalogName: string = versionSpecifier.slice(PNPM_CATALOG_PROTOCOL.length).trim();
  return catalogName || DEFAULT_PNPM_CATALOG_NAME;
}

/**
 * Returns the canonical version specifier that references the specified catalog: `catalog:` for the
 * default catalog, otherwise `catalog:<catalogName>`.
 */
export function formatPnpmCatalogSpecifier(catalogName: string): string {
  return catalogName === DEFAULT_PNPM_CATALOG_NAME
    ? PNPM_CATALOG_PROTOCOL
    : `${PNPM_CATALOG_PROTOCOL}${catalogName}`;
}

/**
 * Returns the version specifier of the entry for the package in the specified catalog, or `undefined`
 * if that catalog does not exist or does not have an entry for the package.
 */
export function tryGetPnpmCatalogVersion(
  catalogs: PnpmCatalogs | undefined,
  catalogName: string,
  packageName: string
): string | undefined {
  // Use own-property checks so that names like "constructor" don't resolve to Object.prototype members
  if (!catalogs || !Object.prototype.hasOwnProperty.call(catalogs, catalogName)) {
    return undefined;
  }

  const catalog: Record<string, string> = catalogs[catalogName];
  if (!Object.prototype.hasOwnProperty.call(catalog, packageName)) {
    return undefined;
  }

  return catalog[packageName];
}

/**
 * If the version specifier for the package references a PNPM catalog, returns the referenced catalog
 * and the version specifier that the reference resolves to. Otherwise, returns `undefined`.
 *
 * @param packageName - the dependency package name, i.e. the key from a "dependencies" table
 * @param versionSpecifier - the dependency version specifier, i.e. the value from a "dependencies" table
 * @param catalogs - the catalogs that are in effect for the subspace of the project that declares the
 * dependency, as returned by `getEffectivePnpmCatalogs()`
 */
export function tryResolvePnpmCatalogReference(
  packageName: string,
  versionSpecifier: string,
  catalogs: PnpmCatalogs | undefined
): IPnpmCatalogReference | undefined {
  const catalogName: string | undefined = tryParsePnpmCatalogName(versionSpecifier);
  if (catalogName === undefined) {
    return undefined;
  }

  return {
    catalogName,
    resolvedVersion: tryGetPnpmCatalogVersion(catalogs, catalogName, packageName)
  };
}

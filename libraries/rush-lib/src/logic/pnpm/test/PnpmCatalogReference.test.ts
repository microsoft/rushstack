// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  DEFAULT_PNPM_CATALOG_NAME,
  tryGetPnpmCatalogVersion,
  tryParsePnpmCatalogName,
  tryResolvePnpmCatalogReference
} from '../PnpmCatalogReference';
import type { PnpmCatalogs } from '../EffectivePnpmOptions';

const CATALOGS: PnpmCatalogs = {
  default: {
    typescript: '~5.8.2'
  },
  tools: {
    eslint: '~9.37.0'
  }
};

describe('PnpmCatalogReference', () => {
  describe(tryParsePnpmCatalogName.name, () => {
    it('maps "catalog:" and "catalog:default" to the default catalog', () => {
      expect(tryParsePnpmCatalogName('catalog:')).toBe(DEFAULT_PNPM_CATALOG_NAME);
      expect(tryParsePnpmCatalogName('catalog:default')).toBe(DEFAULT_PNPM_CATALOG_NAME);
    });

    it('returns the name of a named catalog', () => {
      expect(tryParsePnpmCatalogName('catalog:tools')).toBe('tools');
    });

    it('trims the catalog name, like PNPM does', () => {
      expect(tryParsePnpmCatalogName('catalog: tools ')).toBe('tools');
      expect(tryParsePnpmCatalogName('catalog: ')).toBe(DEFAULT_PNPM_CATALOG_NAME);
    });

    it('returns undefined for version specifiers that are not catalog references', () => {
      for (const versionSpecifier of [
        '~5.8.2',
        '',
        'workspace:*',
        'npm:typescript@~5.8.2',
        'file:../typescript',
        'catalog',
        ' catalog:'
      ]) {
        expect(tryParsePnpmCatalogName(versionSpecifier)).toBeUndefined();
      }
    });
  });

  describe(tryGetPnpmCatalogVersion.name, () => {
    it('returns the version from the catalog entry', () => {
      expect(tryGetPnpmCatalogVersion(CATALOGS, 'default', 'typescript')).toBe('~5.8.2');
      expect(tryGetPnpmCatalogVersion(CATALOGS, 'tools', 'eslint')).toBe('~9.37.0');
    });

    it('returns undefined if the catalog or the entry does not exist', () => {
      expect(tryGetPnpmCatalogVersion(CATALOGS, 'default', 'eslint')).toBeUndefined();
      expect(tryGetPnpmCatalogVersion(CATALOGS, 'nonexistent', 'typescript')).toBeUndefined();
      expect(tryGetPnpmCatalogVersion(undefined, 'default', 'typescript')).toBeUndefined();
    });

    it('does not resolve Object.prototype members', () => {
      expect(tryGetPnpmCatalogVersion(CATALOGS, 'constructor', 'name')).toBeUndefined();
      expect(tryGetPnpmCatalogVersion(CATALOGS, 'default', 'toString')).toBeUndefined();
    });
  });

  describe(tryResolvePnpmCatalogReference.name, () => {
    it('resolves catalog references', () => {
      expect(tryResolvePnpmCatalogReference('typescript', 'catalog:', CATALOGS)).toEqual({
        catalogName: 'default',
        resolvedVersion: '~5.8.2'
      });
      expect(tryResolvePnpmCatalogReference('typescript', 'catalog:default', CATALOGS)).toEqual({
        catalogName: 'default',
        resolvedVersion: '~5.8.2'
      });
      expect(tryResolvePnpmCatalogReference('eslint', 'catalog:tools', CATALOGS)).toEqual({
        catalogName: 'tools',
        resolvedVersion: '~9.37.0'
      });
    });

    it('reports a catalog reference that does not resolve', () => {
      expect(tryResolvePnpmCatalogReference('missing', 'catalog:', CATALOGS)).toEqual({
        catalogName: 'default',
        resolvedVersion: undefined
      });
      expect(tryResolvePnpmCatalogReference('typescript', 'catalog:nonexistent', CATALOGS)).toEqual({
        catalogName: 'nonexistent',
        resolvedVersion: undefined
      });
      expect(tryResolvePnpmCatalogReference('typescript', 'catalog:', undefined)).toEqual({
        catalogName: 'default',
        resolvedVersion: undefined
      });
    });

    it('returns undefined for version specifiers that are not catalog references', () => {
      expect(tryResolvePnpmCatalogReference('typescript', '~5.8.2', CATALOGS)).toBeUndefined();
    });
  });
});

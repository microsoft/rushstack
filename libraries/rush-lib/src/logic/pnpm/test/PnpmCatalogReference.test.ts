// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  DEFAULT_PNPM_CATALOG_NAME,
  formatPnpmCatalogSpecifier,
  tryGetPnpmCatalogVersion,
  tryParsePnpmCatalogName
} from '../PnpmCatalogReference';

describe('PnpmCatalogReference', () => {
  describe(tryParsePnpmCatalogName.name, () => {
    it('normalizes catalog names like PNPM', () => {
      expect(tryParsePnpmCatalogName('catalog:')).toBe(DEFAULT_PNPM_CATALOG_NAME);
      expect(tryParsePnpmCatalogName('catalog: ')).toBe(DEFAULT_PNPM_CATALOG_NAME);
      expect(tryParsePnpmCatalogName('catalog:default')).toBe(DEFAULT_PNPM_CATALOG_NAME);
      expect(tryParsePnpmCatalogName('catalog: tools ')).toBe('tools');
    });

    it('returns undefined for other specifiers', () => {
      for (const versionSpecifier of ['~5.8.2', 'catalog', ' catalog:']) {
        expect(tryParsePnpmCatalogName(versionSpecifier)).toBeUndefined();
      }
    });
  });

  describe(formatPnpmCatalogSpecifier.name, () => {
    it('formats the canonical catalog reference', () => {
      expect(formatPnpmCatalogSpecifier(DEFAULT_PNPM_CATALOG_NAME)).toBe('catalog:');
      expect(formatPnpmCatalogSpecifier('tools')).toBe('catalog:tools');
    });
  });

  describe(tryGetPnpmCatalogVersion.name, () => {
    it('does not resolve Object.prototype members', () => {
      const catalogs: Record<string, Record<string, string>> = { default: { typescript: '~5.8.2' } };
      expect(tryGetPnpmCatalogVersion(catalogs, 'constructor', 'name')).toBeUndefined();
      expect(tryGetPnpmCatalogVersion(catalogs, 'default', 'toString')).toBeUndefined();
    });
  });
});

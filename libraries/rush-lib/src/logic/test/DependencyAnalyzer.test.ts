// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushConfiguration } from '../../api/RushConfiguration';
import type { Subspace } from '../../api/Subspace';
import { DependencyAnalyzer, type IDependencyAnalysis } from '../DependencyAnalyzer';

describe(DependencyAnalyzer.name, () => {
  function getAnalysisForRepoByName(repoName: string): IDependencyAnalysis {
    const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
      `${__dirname}/DependencyAnalyzerTestRepos/${repoName}/rush.json`
    );
    const dependencyAnalyzer: DependencyAnalyzer = DependencyAnalyzer.forRushConfiguration(rushConfiguration);
    const analysis: IDependencyAnalysis = dependencyAnalyzer.getAnalysis(undefined, undefined, false);
    return analysis;
  }

  it('correctly gets the list of dependencies in a repo without allowed alternative versions', () => {
    const analysis: IDependencyAnalysis = getAnalysisForRepoByName('no-allowed-alternatives');
    expect(analysis.allVersionsByPackageName).toMatchInlineSnapshot(`
      Map {
        "dep-1" => Set {
          "1.0.0",
        },
        "dep-2" => Set {
          "1.0.0",
        },
        "dep-3" => Set {
          "1.0.0",
        },
      }
    `);
    expect(analysis.implicitlyPreferredVersionByPackageName).toMatchInlineSnapshot(`
      Map {
        "dep-1" => "1.0.0",
        "dep-2" => "1.0.0",
        "dep-3" => "1.0.0",
      }
    `);
  });

  it('correctly gets the list of dependencies in a repo with allowed alternative versions', () => {
    const analysis: IDependencyAnalysis = getAnalysisForRepoByName('allowed-alternatives');
    expect(analysis.allVersionsByPackageName).toMatchInlineSnapshot(`
      Map {
        "dep-1" => Set {
          "1.0.0",
        },
        "dep-2" => Set {
          "1.0.0",
          "2.0.0",
        },
        "dep-3" => Set {
          "1.0.0",
        },
      }
    `);
    expect(analysis.implicitlyPreferredVersionByPackageName).toMatchInlineSnapshot(`
      Map {
        "dep-1" => "1.0.0",
        "dep-2" => "1.0.0",
        "dep-3" => "1.0.0",
      }
    `);
  });

  it('correctly gets the list of dependencies in a repo with non-allowed inconsistent versions', () => {
    const analysis: IDependencyAnalysis = getAnalysisForRepoByName(
      'no-allowed-alternatives-with-inconsistent-versions'
    );
    expect(analysis.allVersionsByPackageName).toMatchInlineSnapshot(`
      Map {
        "dep-1" => Set {
          "1.0.0",
        },
        "dep-2" => Set {
          "1.0.0",
          "2.0.0",
        },
        "dep-3" => Set {
          "1.0.0",
        },
      }
    `);
    expect(analysis.implicitlyPreferredVersionByPackageName).toMatchInlineSnapshot(`
      Map {
        "dep-1" => "1.0.0",
        "dep-3" => "1.0.0",
      }
    `);
  });

  describe('PNPM catalogs', () => {
    function getAnalysisForRushJson(
      rushJsonPath: string,
      subspaceName?: string,
      addAction: boolean = false
    ): IDependencyAnalysis {
      const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushJsonPath);
      const subspace: Subspace | undefined = subspaceName
        ? rushConfiguration.getSubspace(subspaceName)
        : undefined;
      return DependencyAnalyzer.forRushConfiguration(rushConfiguration).getAnalysis(
        subspace,
        undefined,
        addAction
      );
    }

    it('resolves references to the default and named catalogs', () => {
      const analysis: IDependencyAnalysis = getAnalysisForRushJson(`${__dirname}/repoWithCatalogs/rush.json`);
      expect(analysis.allVersionsByPackageName).toEqual(
        new Map([
          ['react', new Set(['^18.0.0'])],
          ['semver', new Set(['^7.5.4'])],
          ['typescript', new Set(['~5.3.0'])],
          ['eslint', new Set(['^8.50.0'])]
        ])
      );
      expect(analysis.implicitlyPreferredVersionByPackageName).toEqual(
        new Map([
          ['react', '^18.0.0'],
          ['semver', '^7.5.4'],
          ['typescript', '~5.3.0'],
          ['eslint', '^8.50.0']
        ])
      );
      expect(analysis.catalogNamesByPackageName).toEqual(
        new Map([
          ['react', new Set(['default'])],
          ['semver', new Set(['default'])],
          ['typescript', new Set(['tools'])],
          ['eslint', new Set(['tools'])]
        ])
      );
    });

    it('treats "catalog:default" like "catalog:", and ignores catalog references that do not resolve', () => {
      // app-a uses "tslib": "catalog:default" and "typescript": "catalog:"
      // lib-b uses "tslib": "catalog:", a literal "typescript": "~5.8.2", and references
      // a catalog entry and a catalog that don't exist
      const analysis: IDependencyAnalysis = getAnalysisForRushJson(
        `${__dirname}/../pnpm/test/repoWithCatalogs/rush.json`
      );
      expect(analysis.allVersionsByPackageName).toEqual(
        new Map([
          ['tslib', new Set(['~2.3.1'])],
          ['typescript', new Set(['~5.8.2'])],
          ['eslint', new Set(['~9.37.0'])],
          ['aliased-dep', new Set(['npm:real-dep@^1.0.0'])],
          ['git-dep', new Set(['^2.0.0'])]
        ])
      );
      expect(analysis.implicitlyPreferredVersionByPackageName).toEqual(
        new Map([
          ['tslib', '~2.3.1'],
          ['typescript', '~5.8.2'],
          ['eslint', '~9.37.0'],
          ['aliased-dep', 'npm:real-dep@^1.0.0'],
          ['git-dep', '^2.0.0']
        ])
      );
      expect(analysis.catalogNamesByPackageName).toEqual(
        new Map([
          ['tslib', new Set(['default'])],
          ['typescript', new Set(['default'])],
          ['eslint', new Set(['tools'])]
        ])
      );
    });

    it("resolves catalog references using the catalogs of each project's subspace", () => {
      // a (default subspace) and e (own-config-subspace) both use "react": "catalog:", but the
      // catalogs resolve it to different versions. c (other-subspace) falls back to the common catalogs.
      const analysis: IDependencyAnalysis = getAnalysisForRushJson(
        `${__dirname}/repoWithSubspacesCommonCatalogs/rush.json`
      );
      expect(analysis.allVersionsByPackageName).toEqual(
        new Map([
          ['react', new Set(['^18.0.0', '^17.0.0'])],
          ['typescript', new Set(['~5.3.0'])],
          ['foo', new Set(['~2.0.0'])],
          ['lodash', new Set(['^4.17.0'])]
        ])
      );
      expect(analysis.implicitlyPreferredVersionByPackageName).toEqual(
        new Map([
          ['typescript', '~5.3.0'],
          ['foo', '~2.0.0'],
          ['lodash', '^4.17.0']
        ])
      );
      expect(analysis.catalogNamesByPackageName).toEqual(
        new Map([
          ['react', new Set(['default'])],
          ['typescript', new Set(['tools'])],
          ['foo', new Set(['default'])]
        ])
      );
    });

    it('resolves catalog references using the subspace catalogs for "rush add"', () => {
      const ownConfigAnalysis: IDependencyAnalysis = getAnalysisForRushJson(
        `${__dirname}/repoWithSubspacesCommonCatalogs/rush.json`,
        'own-config-subspace',
        true
      );
      expect(ownConfigAnalysis.allVersionsByPackageName).toEqual(new Map([['react', new Set(['^17.0.0'])]]));
      expect(ownConfigAnalysis.implicitlyPreferredVersionByPackageName).toEqual(
        new Map([['react', '^17.0.0']])
      );

      const otherAnalysis: IDependencyAnalysis = getAnalysisForRushJson(
        `${__dirname}/repoWithSubspacesCommonCatalogs/rush.json`,
        'other-subspace',
        true
      );
      expect(otherAnalysis.implicitlyPreferredVersionByPackageName).toEqual(
        new Map([
          ['foo', '~2.0.0'],
          ['lodash', '^4.17.0']
        ])
      );
      expect(otherAnalysis.catalogNamesByPackageName).toEqual(new Map([['foo', new Set(['default'])]]));
    });
  });
});

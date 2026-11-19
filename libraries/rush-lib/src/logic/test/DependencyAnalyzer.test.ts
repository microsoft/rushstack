// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushConfiguration } from '../../api/RushConfiguration';
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
    function getAnalysisForRushJson(rushJsonPath: string): IDependencyAnalysis {
      const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushJsonPath);
      return DependencyAnalyzer.forRushConfiguration(rushConfiguration).getAnalysis(
        undefined,
        undefined,
        false
      );
    }

    it('resolves catalog references, and ignores references without a catalog entry', () => {
      const analysis: IDependencyAnalysis = getAnalysisForRushJson(
        `${__dirname}/../pnpm/test/repoWithCatalogs/rush.json`
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
      // "react": "catalog:" resolves to a different version in each subspace
      const analysis: IDependencyAnalysis = getAnalysisForRushJson(
        `${__dirname}/repoWithSubspacesCommonCatalogs/rush.json`
      );
      expect(analysis.allVersionsByPackageName).toEqual(
        new Map([
          ['react', new Set(['^18.0.0', '^17.0.0'])],
          ['typescript', new Set(['~5.3.0'])],
          ['foo', new Set(['~2.0.0'])]
        ])
      );
    });
  });
});

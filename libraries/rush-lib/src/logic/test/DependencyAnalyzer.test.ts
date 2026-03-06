// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushConfiguration } from '../../api/RushConfiguration.ts';
import { DependencyAnalyzer, type IDependencyAnalysis } from '../DependencyAnalyzer.ts';

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
});

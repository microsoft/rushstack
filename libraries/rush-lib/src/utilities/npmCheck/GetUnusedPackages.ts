// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/// <reference path="../../types/depcheck-typings.d.ts" preserve="true" />

import depcheck from 'depcheck';
import _ from 'lodash';
import { rcFile } from 'rc-config-loader';
import type { INpmCheckPackageJson, INpmCheckState } from './interfaces/INpmCheck';

function skipUnused(currentState: INpmCheckState): boolean {
  return (
    currentState.skipUnused || // manual option to ignore this
    currentState.update || // in the process of doing an update
    !currentState.cwdPackageJson?.name
  ); // there's no package.json
}

type RcFileResult = { config: Record<string, unknown>; filePath: string } | undefined;

function loadRcFile(rcFileName: string): Record<string, unknown> {
  try {
    const results: RcFileResult = rcFile(rcFileName);
    if (!results) {
      return {};
    }
    return results.config;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`Error parsing rc file; skipping it; error: ${error.message}`);
    return {};
  }
}

export default async function getUnusedPackages(currentState: INpmCheckState): Promise<INpmCheckState> {
  if (skipUnused(currentState)) {
    return currentState;
  }

  // removed check for specials as rush doesn't use it
  const depcheckDefaults: depcheck.Options = {
    ignoreDirs: ['sandbox', 'dist', 'generated', '.generated', 'build', 'fixtures', 'jspm_packages'],
    ignoreMatches: [
      'gulp-*',
      'grunt-*',
      'karma-*',
      'angular-*',
      'babel-*',
      'metalsmith-*',
      'eslint-plugin-*',
      '@types/*',
      'grunt',
      'mocha',
      'ava'
    ]
  };

  const npmCheckRc: Record<string, unknown> = loadRcFile('npmcheck');

  const depcheckOptions: depcheck.Options = {
    ...depcheckDefaults,
    ...(npmCheckRc.depcheck || {})
  };

  if (!currentState.cwd || typeof currentState.cwd !== 'string') {
    throw new Error('currentState.cwd must be a defined string for depcheck.');
  }

  return depcheck(currentState.cwd, depcheckOptions)
    .then((depCheckResults: depcheck.Results) => {
      const unusedDependencies: string[] = ([] as string[]).concat(
        depCheckResults.dependencies,
        depCheckResults.devDependencies
      );
      currentState.unusedDependencies = unusedDependencies;

      const cwdPackageJson: INpmCheckPackageJson | undefined = currentState.cwdPackageJson;

      // currently missing will return devDependencies that aren't really missing
      const missingFromPackageJson: Record<string, string[]> = _.omit(
        depCheckResults.missing || {},
        ...(cwdPackageJson?.dependencies ? Object.keys(cwdPackageJson.dependencies) : []),
        ...(cwdPackageJson?.devDependencies ? Object.keys(cwdPackageJson.devDependencies) : [])
      );
      currentState.missingFromPackageJson = missingFromPackageJson;
      return currentState;
    })
    .catch((error: Error) => {
      return currentState;
    });
}

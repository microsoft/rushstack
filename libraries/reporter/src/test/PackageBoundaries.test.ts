// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

interface IPackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

const REPO_ROOT: string = path.resolve(__dirname, '../../../..');

function loadPackageJson(relativePath: string): IPackageJson {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8')) as IPackageJson;
}

describe('package boundaries', () => {
  it('keeps the reporter independent from rush-lib', () => {
    const reporterPackageJson: IPackageJson = loadPackageJson('libraries/reporter/package.json');

    for (const dependencySection of [
      reporterPackageJson.dependencies,
      reporterPackageJson.devDependencies,
      reporterPackageJson.optionalDependencies,
      reporterPackageJson.peerDependencies
    ]) {
      expect(dependencySection?.['@microsoft/rush-lib']).toBeUndefined();
    }
  });

  it('wires the reporter into the Rush engine and frontend', () => {
    const rushLibPackageJson: IPackageJson = loadPackageJson('libraries/rush-lib/package.json');
    const rushPackageJson: IPackageJson = loadPackageJson('apps/rush/package.json');

    expect(rushLibPackageJson.dependencies?.['@rushstack/rush-reporter']).toBe('workspace:*');
    expect(rushPackageJson.dependencies?.['@rushstack/rush-reporter']).toBe('workspace:*');
  });
});

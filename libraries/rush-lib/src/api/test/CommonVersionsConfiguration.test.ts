// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommonVersionsConfiguration } from '../CommonVersionsConfiguration.ts';
import type { RushConfiguration } from '../RushConfiguration.ts';

describe(CommonVersionsConfiguration.name, () => {
  it('can load the file', () => {
    const filename: string = `${__dirname}/jsonFiles/common-versions.json`;
    const configuration: CommonVersionsConfiguration = CommonVersionsConfiguration.loadFromFile(
      filename,
      {} as RushConfiguration
    );

    expect(configuration.preferredVersions.get('@scope/library-1')).toEqual('~3.2.1');
    expect(configuration.allowedAlternativeVersions.get('library-3')).toEqual(['^1.2.3']);
  });

  it('gets `ensureConsistentVersions` from the file if it provides that value', () => {
    const filename: string = `${__dirname}/jsonFiles/common-versions-with-ensureConsistentVersionsTrue.json`;
    const configuration: CommonVersionsConfiguration = CommonVersionsConfiguration.loadFromFile(filename, {
      _ensureConsistentVersionsJsonValue: undefined,
      ensureConsistentVersions: false
    } as RushConfiguration);

    expect(configuration.ensureConsistentVersions).toBe(true);
  });

  it("gets `ensureConsistentVersions` from the rush configuration if common-versions.json doesn't provide that value", () => {
    const filename: string = `${__dirname}/jsonFiles/common-versions.json`;
    const configuration: CommonVersionsConfiguration = CommonVersionsConfiguration.loadFromFile(filename, {
      _ensureConsistentVersionsJsonValue: false,
      ensureConsistentVersions: false
    } as RushConfiguration);

    expect(configuration.ensureConsistentVersions).toBe(false);
  });

  it('Does not allow `ensureConsistentVersions` to be set in both rush.json and common-versions.json', () => {
    const filename: string = `${__dirname}/jsonFiles/common-versions-with-ensureConsistentVersionsTrue.json`;
    expect(() =>
      CommonVersionsConfiguration.loadFromFile(filename, {
        _ensureConsistentVersionsJsonValue: false,
        ensureConsistentVersions: false
      } as RushConfiguration)
    ).toThrowErrorMatchingSnapshot();
  });
});

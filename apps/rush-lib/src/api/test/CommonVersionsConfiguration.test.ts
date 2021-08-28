// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';

import { CommonVersionsConfiguration } from '../CommonVersionsConfiguration';

describe('CommonVersionsConfiguration', () => {
  it('can load the file', () => {
    const filename: string = path.resolve(__dirname, 'jsonFiles', 'common-versions.json');
    const configuration: CommonVersionsConfiguration = CommonVersionsConfiguration.loadFromFile(filename);

    expect(configuration.preferredVersions.get('@scope/library-1')).toEqual('~3.2.1');
    expect(configuration.xstitchPreferredVersions.get('library-2')).toEqual('1.2.3');
    expect(configuration.allowedAlternativeVersions.get('library-3')).toEqual(['^1.2.3']);
  });

  it('can determine default semver style', () => {
    const filename: string = path.resolve(__dirname, 'jsonFiles', 'common-versions.json');
    const configuration: CommonVersionsConfiguration = CommonVersionsConfiguration.loadFromFile(filename);

    const exactStyle = {
      semverStyle: 'exact',
      semverSymbol: ''
    };
    const tildeStyle = {
      semverStyle: 'tilde',
      semverSymbol: '~'
    };
    const caretStyle = {
      semverStyle: 'caret',
      semverSymbol: '^'
    };

    expect(configuration.getDefaultSemverForPackage('@types/node')).toEqual(exactStyle);
    expect(configuration.getDefaultSemverForPackage('tilde-library')).toEqual(tildeStyle);

    expect(configuration.getDefaultSemverForPackage('foo-package')).toEqual(caretStyle);
    expect(configuration.getDefaultSemverForPackage('@type/typo')).toEqual(caretStyle);
    expect(configuration.getDefaultSemverForPackage('tilde-library-2')).toEqual(caretStyle);
  });
});

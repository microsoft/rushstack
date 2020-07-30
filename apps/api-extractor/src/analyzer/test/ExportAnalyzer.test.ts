// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ExportAnalyzer } from '../ExportAnalyzer';

describe('ExportAnalyzer', () => {
  it('handles generateIdentifierForModulePath() cases', () => {
    expect(ExportAnalyzer.generateIdentifierForModulePath('@scope/my-package')).toEqual('myPackage');
    expect(ExportAnalyzer.generateIdentifierForModulePath('my-package')).toEqual('myPackage');
    expect(ExportAnalyzer.generateIdentifierForModulePath('my-package/path/to/A-thing')).toEqual('AThing');
    expect(ExportAnalyzer.generateIdentifierForModulePath('my-package/path/to/a-thing')).toEqual('aThing');
    expect(ExportAnalyzer.generateIdentifierForModulePath('my-package/path/to/123a-thing')).toEqual('aThing');
    expect(ExportAnalyzer.generateIdentifierForModulePath('my-package/path/to//')).toEqual('to');
    expect(ExportAnalyzer.generateIdentifierForModulePath('@!')).toEqual('_');
    expect(ExportAnalyzer.generateIdentifierForModulePath('')).toEqual('_');
  });
});

// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { _validateTsDocReleaseTag, withSchemaMeta, _getSchemaMeta } from '../SchemaMetaHelpers';

describe(_validateTsDocReleaseTag.name, () => {
  test('accepts valid release tags', () => {
    expect(() => _validateTsDocReleaseTag('@public', 'src')).not.toThrow();
    expect(() => _validateTsDocReleaseTag('@beta', 'src')).not.toThrow();
    expect(() => _validateTsDocReleaseTag('@alpha', 'src')).not.toThrow();
    expect(() => _validateTsDocReleaseTag('@internal', 'src')).not.toThrow();
  });

  test('rejects invalid release tags', () => {
    expect(() => _validateTsDocReleaseTag('public', 'src')).toThrow(/Invalid x-tsdoc-release-tag/);
    expect(() => _validateTsDocReleaseTag('@Public', 'src')).toThrow(/Invalid x-tsdoc-release-tag/);
    expect(() => _validateTsDocReleaseTag('@two words', 'src')).toThrow(/Invalid x-tsdoc-release-tag/);
    expect(() => _validateTsDocReleaseTag('', 'src')).toThrow(/Invalid x-tsdoc-release-tag/);
  });
});

describe(withSchemaMeta.name, () => {
  test('returns the schema unchanged and stores metadata', () => {
    const schema: { _def: object; parse: () => void } = {
      _def: {},
      parse: () => undefined
    };
    const result: object = withSchemaMeta(schema, { title: 'Hello', releaseTag: '@public' });
    expect(result).toBe(schema);
    expect(_getSchemaMeta(schema)).toEqual({ title: 'Hello', releaseTag: '@public' });
  });

  test('validates the release tag immediately', () => {
    const schema: object = { _def: {}, parse: () => undefined };
    expect(() => withSchemaMeta(schema, { releaseTag: 'public' })).toThrow(
      /Invalid x-tsdoc-release-tag/
    );
  });
});

// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { _addTsDocReleaseTagToExports, _validateTsDocReleaseTag } from '../TsDocReleaseTagHelpers.ts';

describe(_addTsDocReleaseTagToExports.name, () => {
  test('injects tag into an existing JSDoc comment before an export', () => {
    const input: string = ['/**', ' * A description.', ' */', 'export type Foo = {};'].join('\n');

    expect(_addTsDocReleaseTagToExports(input, '@beta')).toMatchSnapshot();
  });

  test('creates a new JSDoc block for an export without a preceding comment', () => {
    const input: string = 'export type Foo = {};';

    expect(_addTsDocReleaseTagToExports(input, '@public')).toMatchSnapshot();
  });

  test('handles multiple exports with and without JSDoc comments', () => {
    const input: string = [
      '/**',
      ' * First type.',
      ' */',
      'export type Foo = {};',
      '',
      'export type Bar = {};'
    ].join('\n');

    expect(_addTsDocReleaseTagToExports(input, '@beta')).toMatchSnapshot();
  });

  test('normalizes CRLF line endings to LF', () => {
    const input: string = '/**\r\n * A description.\r\n */\r\nexport type Foo = {};';

    expect(_addTsDocReleaseTagToExports(input, '@beta')).toMatchSnapshot();
  });

  test('does not double-tag an export that already has a JSDoc block', () => {
    const input: string = [
      '/**',
      ' * Already documented.',
      ' */',
      'export interface IConfig {',
      '  name: string;',
      '}'
    ].join('\n');

    const result: string = _addTsDocReleaseTagToExports(input, '@public');

    // The tag should appear exactly once
    const tagOccurrences: number = (result.match(/@public/g) || []).length;
    expect(tagOccurrences).toBe(1);
    expect(result).toMatchSnapshot();
  });

  test('does not modify non-export lines', () => {
    const input: string = ['// A leading comment', 'const internal = 1;', '', 'export type Foo = {};'].join(
      '\n'
    );

    expect(_addTsDocReleaseTagToExports(input, '@beta')).toMatchSnapshot();
  });
});

describe(_validateTsDocReleaseTag.name, () => {
  test('accepts valid release tags', () => {
    expect(() => _validateTsDocReleaseTag('@public', 'test.schema.json')).not.toThrow();
    expect(() => _validateTsDocReleaseTag('@beta', 'test.schema.json')).not.toThrow();
    expect(() => _validateTsDocReleaseTag('@alpha', 'test.schema.json')).not.toThrow();
    expect(() => _validateTsDocReleaseTag('@internal', 'test.schema.json')).not.toThrow();
  });

  test('rejects invalid release tags', () => {
    expect(() => _validateTsDocReleaseTag('public', 'test.schema.json')).toThrow(
      /Invalid x-tsdoc-release-tag/
    );
    expect(() => _validateTsDocReleaseTag('@Public', 'test.schema.json')).toThrow(
      /Invalid x-tsdoc-release-tag/
    );
    expect(() => _validateTsDocReleaseTag('@two words', 'test.schema.json')).toThrow(
      /Invalid x-tsdoc-release-tag/
    );
    expect(() => _validateTsDocReleaseTag('', 'test.schema.json')).toThrow(/Invalid x-tsdoc-release-tag/);
  });
});

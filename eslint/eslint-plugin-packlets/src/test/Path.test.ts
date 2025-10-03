// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import { Path } from '../Path';

function toPosixPath(value: string): string {
  return value.replace(/[\\\/]/g, '/');
}
function toNativePath(value: string): string {
  return value.replace(/[\\\/]/g, path.sep);
}

function relativeCaseInsensitive(from: string, to: string): string {
  return toPosixPath(Path['_relativeCaseInsensitive'](toNativePath(from), toNativePath(to)));
}

describe(Path.name, () => {
  test('_detectCaseSensitive()', () => {
    // NOTE: To ensure these tests are deterministic, only use absolute paths
    expect(relativeCaseInsensitive('/', '/')).toEqual('');
    expect(relativeCaseInsensitive('/', '/a')).toEqual('a');
    expect(relativeCaseInsensitive('/', '/a/')).toEqual('a');
    expect(relativeCaseInsensitive('/', '/a//')).toEqual('a');
    expect(relativeCaseInsensitive('/', '/a/b')).toEqual('a/b');
    expect(relativeCaseInsensitive('/', '/a/b/c')).toEqual('a/b/c');
    expect(relativeCaseInsensitive('/A', '/a/b/c')).toEqual('b/c');
    expect(relativeCaseInsensitive('/A/', '/a/b/c')).toEqual('b/c');
    expect(relativeCaseInsensitive('/A/B', '/a/b/c')).toEqual('c');
    expect(relativeCaseInsensitive('/A/b/C', '/a/b/c')).toEqual('');
    expect(relativeCaseInsensitive('/a/B/c', '/a/b/c')).toEqual('');
    expect(relativeCaseInsensitive('/a/B/c/D', '/a/b/c')).toEqual('..');
    expect(relativeCaseInsensitive('/a/B/c/D', '/a/b/c/e')).toEqual('../e');
  });
});

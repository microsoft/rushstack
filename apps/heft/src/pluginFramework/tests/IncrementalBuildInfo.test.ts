// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';

import { Path } from '@rushstack/node-core-library';

import {
  serializeBuildInfo,
  deserializeBuildInfo,
  type IIncrementalBuildInfo,
  type ISerializedIncrementalBuildInfo
} from '../IncrementalBuildInfo';

const posixBuildInfo: IIncrementalBuildInfo = {
  configHash: 'foobar',
  inputFileVersions: new Map([
    ['/a/b/c/file1', '1'],
    ['/a/b/c/file2', '2']
  ]),
  fileDependencies: new Map([
    ['/a/b/c/output1', ['/a/b/c/file1']],
    ['/a/b/c/output2', ['/a/b/c/file1', '/a/b/c/file2']]
  ])
};

const win32BuildInfo: IIncrementalBuildInfo = {
  configHash: 'foobar',
  inputFileVersions: new Map([
    ['A:\\b\\c\\file1', '1'],
    ['A:\\b\\c\\file2', '2']
  ]),
  fileDependencies: new Map([
    ['A:\\b\\c\\output1', ['A:\\b\\c\\file1']],
    ['A:\\b\\c\\output2', ['A:\\b\\c\\file1', 'A:\\b\\c\\file2']]
  ])
};

const posixBasePath: string = '/a/b/temp';
const win32BasePath: string = 'A:\\b\\temp';

function posixToPortable(absolutePath: string): string {
  return path.posix.relative(posixBasePath, absolutePath);
}
function portableToPosix(portablePath: string): string {
  return path.posix.resolve(posixBasePath, portablePath);
}

function win32ToPortable(absolutePath: string): string {
  return Path.convertToSlashes(path.win32.relative(win32BasePath, absolutePath));
}
function portableToWin32(portablePath: string): string {
  return path.win32.resolve(win32BasePath, portablePath);
}

describe(serializeBuildInfo.name, () => {
  it('Round trips correctly (POSIX)', () => {
    const serialized: ISerializedIncrementalBuildInfo = serializeBuildInfo(posixBuildInfo, posixToPortable);

    const deserialized: IIncrementalBuildInfo = deserializeBuildInfo(serialized, portableToPosix);

    expect(deserialized).toEqual(posixBuildInfo);
  });

  it('Round trips correctly (Win32)', () => {
    const serialized: ISerializedIncrementalBuildInfo = serializeBuildInfo(win32BuildInfo, win32ToPortable);

    const deserialized: IIncrementalBuildInfo = deserializeBuildInfo(serialized, portableToWin32);

    expect(deserialized).toEqual(win32BuildInfo);
  });

  it('Converts (POSIX to Win32)', () => {
    const serialized: ISerializedIncrementalBuildInfo = serializeBuildInfo(posixBuildInfo, posixToPortable);

    const deserialized: IIncrementalBuildInfo = deserializeBuildInfo(serialized, portableToWin32);

    expect(deserialized).toEqual(win32BuildInfo);
  });

  it('Converts (Win32 to POSIX)', () => {
    const serialized: ISerializedIncrementalBuildInfo = serializeBuildInfo(win32BuildInfo, win32ToPortable);

    const deserialized: IIncrementalBuildInfo = deserializeBuildInfo(serialized, portableToPosix);

    expect(deserialized).toEqual(posixBuildInfo);
  });

  it('Has expected serialized format', () => {
    const serializedPosix: ISerializedIncrementalBuildInfo = serializeBuildInfo(
      posixBuildInfo,
      posixToPortable
    );
    const serializedWin32: ISerializedIncrementalBuildInfo = serializeBuildInfo(
      win32BuildInfo,
      win32ToPortable
    );

    expect(serializedPosix).toMatchSnapshot('posix');
    expect(serializedWin32).toMatchSnapshot('win32');

    expect(serializedPosix).toEqual(serializedWin32);
  });
});

// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { SubprocessRunnerBase } from '../SubprocessRunnerBase';
import { FileError } from '../../../pluginFramework/logging/FileError';

describe('SubprocessRunnerBase', () => {
  it(`${SubprocessRunnerBase.serializeForIpcMessage.name} correctly serializes objects`, () => {
    expect(SubprocessRunnerBase.serializeForIpcMessage(1)).toMatchSnapshot();
    expect(SubprocessRunnerBase.serializeForIpcMessage(false)).toMatchSnapshot();
    expect(SubprocessRunnerBase.serializeForIpcMessage('abc')).toMatchSnapshot();
    expect(SubprocessRunnerBase.serializeForIpcMessage(null)).toMatchSnapshot();
    expect(SubprocessRunnerBase.serializeForIpcMessage(undefined)).toMatchSnapshot();
    const error: Error = new Error();
    error.stack = 'ERROR STACK';
    expect(SubprocessRunnerBase.serializeForIpcMessage(error)).toMatchSnapshot();
    const fileError1: FileError = new FileError('message', 'path/to/file', 4, 29);
    fileError1.stack = 'ERROR STACK';
    expect(SubprocessRunnerBase.serializeForIpcMessage(fileError1)).toMatchSnapshot();
    const fileError2: FileError = new FileError('message', 'path/to/file', 4);
    fileError2.stack = 'ERROR STACK';
    expect(SubprocessRunnerBase.serializeForIpcMessage(fileError2)).toMatchSnapshot();
    const fileError3: FileError = new FileError('message', 'path/to/file');
    fileError3.stack = 'ERROR STACK';
    expect(SubprocessRunnerBase.serializeForIpcMessage(fileError3)).toMatchSnapshot();
  });

  it(`${SubprocessRunnerBase.serializeForIpcMessage.name} doesn't handle non-error objects`, () => {
    expect(() => SubprocessRunnerBase.serializeForIpcMessage({})).toThrow();
  });

  it('de-serializes serialized objects', () => {
    function testDeserialization(x: unknown): void {
      expect(
        SubprocessRunnerBase.deserializeFromIpcMessage(SubprocessRunnerBase.serializeForIpcMessage(x))
      ).toEqual(x);
    }

    testDeserialization(1);
    testDeserialization(false);
    testDeserialization('abc');
    testDeserialization(null);
    testDeserialization(undefined);
    testDeserialization(new Error());
    const fileError1: FileError = new FileError('message', 'path/to/file', 4, 29);
    testDeserialization(fileError1);
    const fileError2: FileError = new FileError('message', 'path/to/file', 4);
    testDeserialization(fileError2);
    const fileError3: FileError = new FileError('message', 'path/to/file');
    testDeserialization(fileError3);
  });
});

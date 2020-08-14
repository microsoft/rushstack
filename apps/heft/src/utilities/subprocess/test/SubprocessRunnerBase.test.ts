// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { SubprocessRunnerBase } from '../SubprocessRunnerBase';

describe('SubprocessRunnerBase', () => {
  it(`${SubprocessRunnerBase.serializeArg.name} correctly serializes objects`, () => {
    expect(SubprocessRunnerBase.serializeArg(1)).toMatchSnapshot();
    expect(SubprocessRunnerBase.serializeArg(false)).toMatchSnapshot();
    expect(SubprocessRunnerBase.serializeArg('abc')).toMatchSnapshot();
    // eslint-disable-next-line @rushstack/no-null
    expect(SubprocessRunnerBase.serializeArg(null)).toMatchSnapshot();
    expect(SubprocessRunnerBase.serializeArg(undefined)).toMatchSnapshot();
    const error: Error = new Error();
    error.stack = 'ERROR STACK';
    expect(SubprocessRunnerBase.serializeArg(error)).toMatchSnapshot();
  });

  it(`${SubprocessRunnerBase.serializeArg.name} doesn't handle non-error objects`, () => {
    expect(() => SubprocessRunnerBase.serializeArg({})).toThrow();
  });

  it('de-serializes serialized objects', () => {
    function testDeserialization(x: unknown): void {
      expect(SubprocessRunnerBase.deserializeArg(SubprocessRunnerBase.serializeArg(x))).toEqual(x);
    }

    testDeserialization(1);
    testDeserialization(false);
    testDeserialization('abc');
    // eslint-disable-next-line @rushstack/no-null
    testDeserialization(null);
    testDeserialization(undefined);
    testDeserialization(new Error());
  });
});

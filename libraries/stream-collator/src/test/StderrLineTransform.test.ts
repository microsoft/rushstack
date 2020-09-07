// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { StreamKind } from '../ITerminalChunk';
import { StderrLineTransform } from '../StderrLineTransform';
import { TestWriter } from '../TestWriter';

describe('LineAlignerStream', () => {
  it('should report stdout if there is no stderr', () => {
    const testWriter: TestWriter = new TestWriter();
    const transform: StderrLineTransform = new StderrLineTransform({ destination: testWriter });

    transform.writeChunk({ text: 'stdout 1\nstdout 2\n', stream: StreamKind.Stdout });
    transform.close();

    expect(testWriter.chunks).toMatchSnapshot();
  });
});

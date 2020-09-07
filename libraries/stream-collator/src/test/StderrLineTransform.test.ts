// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { TerminalChunkKind } from '../ITerminalChunk';
import { StderrLineTransform } from '../StderrLineTransform';
import { TestWritable } from '../TestWritable';

describe('StderrLineTransform', () => {
  it('should report stdout if there is no stderr', () => {
    const testWritable: TestWritable = new TestWritable();
    const transform: StderrLineTransform = new StderrLineTransform({ destination: testWritable });

    transform.writeChunk({ text: 'stdout 1\nstdout 2\n', kind: TerminalChunkKind.Stdout });
    transform.close();

    expect(testWritable.chunks).toMatchSnapshot();
  });
});

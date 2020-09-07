// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { StreamKind } from '../ITerminalChunk';
import { StdioSummarizer } from '../StdioSummarizer';
import { StderrLineTransform } from '../StderrLineTransform';

describe('StdioSummarizer', () => {
  let summarizer: StdioSummarizer;
  let transform: StderrLineTransform;

  beforeEach(() => {
    summarizer = new StdioSummarizer();
    transform = new StderrLineTransform(summarizer);
  });

  it('should report stdout if there is no stderr', () => {
    transform.writeChunk({ text: 'stdout 1\nstdout 2\n', stream: StreamKind.Stdout });
    transform.close();

    expect(summarizer.isOpen).toBe(false);
    expect(summarizer.getReport()).toMatchSnapshot();
  });

  it('should abridge extra lines', () => {
    transform.writeChunk({ text: 'discarded stdout\n', stream: StreamKind.Stdout });
    for (let i: number = 0; i < 10; ++i) {
      transform.writeChunk({ text: `leading ${i}\n`, stream: StreamKind.Stderr });
      transform.writeChunk({ text: 'discarded stdout\n', stream: StreamKind.Stdout });
    }

    transform.writeChunk({ text: `discarded middle 1\n`, stream: StreamKind.Stderr });
    transform.writeChunk({ text: `discarded middle 2\n`, stream: StreamKind.Stderr });

    for (let i: number = 0; i < 10; ++i) {
      transform.writeChunk({ text: `trailing ${i}\n`, stream: StreamKind.Stderr });
      transform.writeChunk({ text: 'discarded stdout\n', stream: StreamKind.Stdout });
    }

    transform.close();

    expect(summarizer.getReport()).toMatchSnapshot();
  });

  it('should concatenate partial lines', () => {
    transform.writeChunk({ text: 'abc', stream: StreamKind.Stderr });
    transform.writeChunk({ text: '', stream: StreamKind.Stderr });
    transform.writeChunk({ text: 'de\nf\n\ng', stream: StreamKind.Stderr });
    transform.writeChunk({ text: '\n', stream: StreamKind.Stderr });
    transform.writeChunk({ text: 'h', stream: StreamKind.Stderr });
    transform.close();

    expect(summarizer.getReport()).toMatchSnapshot();
  });
});

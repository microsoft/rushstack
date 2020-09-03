// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { StreamKind } from '../CollatedChunk';
import { StdioSummarizer } from '../StdioSummarizer';

describe('StdioSummarizer', () => {
  it('should report stdout if there is no stderr', () => {
    const summarizer: StdioSummarizer = new StdioSummarizer();
    summarizer.writeChunk({ text: 'stdout 1\nstdout 2\n', stream: StreamKind.Stdout });
    summarizer.close();

    expect(summarizer.getReport()).toMatchSnapshot();
  });

  it('should abridge extra lines', () => {
    const summarizer: StdioSummarizer = new StdioSummarizer();
    summarizer.writeChunk({ text: 'discarded stdout\n', stream: StreamKind.Stdout });
    for (let i: number = 0; i < 10; ++i) {
      summarizer.writeChunk({ text: `leading ${i}\n`, stream: StreamKind.Stderr });
      summarizer.writeChunk({ text: 'discarded stdout\n', stream: StreamKind.Stdout });
    }

    summarizer.writeChunk({ text: `discarded middle 1\n`, stream: StreamKind.Stderr });
    summarizer.writeChunk({ text: `discarded middle 2\n`, stream: StreamKind.Stderr });

    for (let i: number = 0; i < 10; ++i) {
      summarizer.writeChunk({ text: `trailing ${i}\n`, stream: StreamKind.Stderr });
      summarizer.writeChunk({ text: 'discarded stdout\n', stream: StreamKind.Stdout });
    }

    summarizer.close();

    expect(summarizer.getReport()).toMatchSnapshot();
  });

  it('should concatenate partial lines', () => {
    const summarizer: StdioSummarizer = new StdioSummarizer();
    summarizer.writeChunk({ text: 'abc', stream: StreamKind.Stderr });
    summarizer.writeChunk({ text: '', stream: StreamKind.Stderr });
    summarizer.writeChunk({ text: 'de\nf\n\ng', stream: StreamKind.Stderr });
    summarizer.writeChunk({ text: '\n', stream: StreamKind.Stderr });
    summarizer.writeChunk({ text: 'h', stream: StreamKind.Stderr });
    summarizer.close();

    expect(summarizer.getReport()).toMatchSnapshot();
  });
});

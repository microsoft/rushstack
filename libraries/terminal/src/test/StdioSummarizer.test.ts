// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { TerminalChunkKind } from '../ITerminalChunk.ts';
import { StdioSummarizer } from '../StdioSummarizer.ts';
import { StderrLineTransform } from '../StdioLineTransform.ts';
import { TextRewriterTransform } from '../TextRewriterTransform.ts';
import { NewlineKind } from '@rushstack/node-core-library';

describe(StdioSummarizer.name, () => {
  let summarizer: StdioSummarizer;
  let stderrLineTransform: StderrLineTransform;
  let transform: TextRewriterTransform;

  beforeEach(() => {
    summarizer = new StdioSummarizer();
    stderrLineTransform = new StderrLineTransform({ destination: summarizer });
    transform = new TextRewriterTransform({
      destination: stderrLineTransform,
      normalizeNewlines: NewlineKind.Lf
    });
  });

  it('should report stdout if there is no stderr', () => {
    transform.writeChunk({ text: 'stdout 1\nstdout 2\n', kind: TerminalChunkKind.Stdout });
    transform.close();

    expect(summarizer.isOpen).toBe(false);
    expect(summarizer.getReport()).toMatchSnapshot();
  });

  it('should abridge extra lines', () => {
    transform.writeChunk({ text: 'discarded stdout\n', kind: TerminalChunkKind.Stdout });
    for (let i: number = 0; i < 10; ++i) {
      transform.writeChunk({ text: `leading ${i}\n`, kind: TerminalChunkKind.Stderr });
      transform.writeChunk({ text: 'discarded stdout\n', kind: TerminalChunkKind.Stdout });
    }

    transform.writeChunk({ text: `discarded middle 1\n`, kind: TerminalChunkKind.Stderr });
    transform.writeChunk({ text: `discarded middle 2\n`, kind: TerminalChunkKind.Stderr });

    for (let i: number = 0; i < 10; ++i) {
      transform.writeChunk({ text: `trailing ${i}\n`, kind: TerminalChunkKind.Stderr });
      transform.writeChunk({ text: 'discarded stdout\n', kind: TerminalChunkKind.Stdout });
    }

    transform.close();

    expect(summarizer.getReport()).toMatchSnapshot();
  });

  it('should concatenate partial lines', () => {
    transform.writeChunk({ text: 'abc', kind: TerminalChunkKind.Stderr });
    transform.writeChunk({ text: '', kind: TerminalChunkKind.Stderr });
    transform.writeChunk({ text: 'de\nf\n\ng', kind: TerminalChunkKind.Stderr });
    transform.writeChunk({ text: '\n', kind: TerminalChunkKind.Stderr });
    transform.writeChunk({ text: 'h', kind: TerminalChunkKind.Stderr });
    transform.close();

    expect(summarizer.getReport()).toMatchSnapshot();
  });
});

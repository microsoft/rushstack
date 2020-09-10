// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { NewlineKind } from '@rushstack/node-core-library';

import { ITerminalChunk, TerminalChunkKind } from './ITerminalChunk';
import { TerminalTransform, ITerminalTransformOptions } from './TerminalTransform';
import { TextRewriter, TextRewriterState } from './TextRewriter';
import { RemoveColorsTextRewriter } from './RemoveColorsTextRewriter';
import { NormalizeNewlinesTextRewriter } from './NormalizeNewlinesTextRewriter';

/** @beta */
export interface ITextRewriterTransformOptions extends ITerminalTransformOptions {
  textRewriters?: TextRewriter[];
  removeColors?: boolean;
  normalizeNewlines?: NewlineKind;
  ensureNewlineAtEnd?: boolean;
}

/** @beta */
export class TextRewriterTransform extends TerminalTransform {
  private readonly _stderrStates: TextRewriterState[];
  private readonly _stdoutStates: TextRewriterState[];

  public readonly textRewriters: ReadonlyArray<TextRewriter>;

  public constructor(options: ITextRewriterTransformOptions) {
    super(options);

    const textRewriters: TextRewriter[] = options.textRewriters || [];

    if (options.removeColors) {
      textRewriters.push(new RemoveColorsTextRewriter());
    }
    if (options.normalizeNewlines) {
      textRewriters.push(
        new NormalizeNewlinesTextRewriter({
          newlineKind: options.normalizeNewlines,
          ensureNewlineAtEnd: options.ensureNewlineAtEnd
        })
      );
    }

    if (textRewriters.length === 0) {
      throw new Error('TextRewriterTransform requires at least one matcher');
    }

    this.textRewriters = textRewriters;

    this._stderrStates = this.textRewriters.map((x) => x.initialize());
    this._stdoutStates = this.textRewriters.map((x) => x.initialize());
  }

  protected onWriteChunk(chunk: ITerminalChunk): void {
    if (chunk.kind === TerminalChunkKind.Stderr) {
      this._processText(chunk, this._stderrStates);
    } else if (chunk.kind === TerminalChunkKind.Stdout) {
      this._processText(chunk, this._stdoutStates);
    } else {
      this.destination.writeChunk(chunk);
    }
  }

  private _processText(chunk: ITerminalChunk, states: TextRewriterState[]): void {
    let text: string = chunk.text;
    for (let i: number = 0; i < states.length; ++i) {
      if (text.length > 0) {
        text = this.textRewriters[i].process(states[i], text);
      }
    }
    if (text.length > 0) {
      // If possible, avoid allocating a new chunk
      if (text === chunk.text) {
        this.destination.writeChunk(chunk);
      } else {
        this.destination.writeChunk({
          text: text,
          kind: chunk.kind
        });
      }
    }
  }

  private _flushText(states: TextRewriterState[], chunkKind: TerminalChunkKind): void {
    let text: string = '';
    for (let i: number = 0; i < states.length; ++i) {
      if (text.length > 0) {
        text = this.textRewriters[i].process(states[i], text);
      }
      text += this.textRewriters[i].flush(states[i]);
    }
    if (text.length > 0) {
      this.destination.writeChunk({
        text: text,
        kind: chunkKind
      });
    }
  }

  protected onClose(): void {
    this._flushText(this._stderrStates, TerminalChunkKind.Stderr);
    this._flushText(this._stderrStates, TerminalChunkKind.Stdout);

    this.autocloseDestination();
  }
}

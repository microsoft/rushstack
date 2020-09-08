// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { NewlineKind } from '@rushstack/node-core-library';

import { ITerminalChunk, TerminalChunkKind } from './ITerminalChunk';
import { TerminalTransform, ITerminalTransformOptions } from './TerminalTransform';
import { CharMatcher, CharMatcherState } from './CharMatcher';
import { RemoveColorsCharMatcher } from './RemoveColorsCharMatcher';
import { NormalizeNewlinesCharMatcher } from './NormalizeNewlinesCharMatcher';

/** @beta */
export interface ICharMatcherTransformOptions extends ITerminalTransformOptions {
  charMatchers?: CharMatcher[];
  removeColors?: boolean;
  normalizeNewlines?: NewlineKind;
}

/** @beta */
export class CharMatcherTransform extends TerminalTransform {
  private readonly _stderrStates: CharMatcherState[];
  private readonly _stdoutStates: CharMatcherState[];

  public readonly charMatchers: ReadonlyArray<CharMatcher>;

  public constructor(options: ICharMatcherTransformOptions) {
    super(options);

    const charMatchers: CharMatcher[] = options.charMatchers || [];

    if (options.removeColors) {
      charMatchers.push(new RemoveColorsCharMatcher());
    }
    if (options.normalizeNewlines) {
      charMatchers.push(new NormalizeNewlinesCharMatcher(options.normalizeNewlines));
    }

    if (charMatchers.length === 0) {
      throw new Error('CharMatcherTransform requires at least one matcher');
    }

    this.charMatchers = charMatchers;

    this._stderrStates = this.charMatchers.map((x) => x.initialize());
    this._stdoutStates = this.charMatchers.map((x) => x.initialize());
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

  private _processText(chunk: ITerminalChunk, states: CharMatcherState[]): void {
    let text: string = chunk.text;
    for (let i: number = 0; i < states.length; ++i) {
      if (text.length > 0) {
        text = this.charMatchers[i].process(states[i], text);
      }
    }
    if (text.length > 0) {
      this.destination.writeChunk({
        text: text,
        kind: chunk.kind
      });
    }
  }

  private _flushText(states: CharMatcherState[], chunkKind: TerminalChunkKind): void {
    let text: string = '';
    for (let i: number = 0; i < states.length; ++i) {
      if (text.length > 0) {
        text = this.charMatchers[i].process(states[i], text);
      }
      text += this.charMatchers[i].flush(states[i]);
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
    this.destination.close();
  }
}

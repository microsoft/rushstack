// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ITerminalChunk } from './ITerminalChunk';
import { TerminalTransform, ITerminalTransformOptions } from './TerminalTransform';
import { CharMatcher } from './CharMatcher';

/** @beta */
export interface ICharMatcherTransformOptions extends ITerminalTransformOptions {
  charMatchers: CharMatcher[];
}

/** @beta */
export class CharMatcherTransform extends TerminalTransform {
  public readonly charMatchers: ReadonlyArray<CharMatcher>;

  public constructor(options: ICharMatcherTransformOptions) {
    super(options);
  }

  protected onWriteChunk(chunk: ITerminalChunk): void {}
}

// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Brand } from '@rushstack/node-core-library';

/**
 * Represents the internal state of a {@link TextRewriter} subclass.
 *
 * @public
 */
export type TextRewriterState = Brand<unknown, 'TextRewriterState'>;

/**
 * The abstract base class for operations that can be applied by {@link TextRewriterTransform}.
 *
 * @remarks
 * The {@link TextRewriterTransform} applies one or more character rewriting operations to its
 * chunk stream.  Since these operations are applied separately to `stderr` and `stdout`, the
 * state is stored in an opaque `TextRewriterState` object.
 *
 * Conceptually, a `TextRewriter` subclass is very similar to a regular expression, with the difference
 * that `RegExp` operates on a text string, whereas `TextRewriter` operates on a stream of characters.
 *
 * The two most common subclasses are {@link NormalizeNewlinesTextRewriter} and {@link RemoveColorsTextRewriter}.
 *
 * @public
 */
export abstract class TextRewriter {
  public abstract initialize(): TextRewriterState;
  public abstract process(state: TextRewriterState, text: string): string;
  public abstract flush(state: TextRewriterState): string;
}

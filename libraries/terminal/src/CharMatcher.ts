// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Brand } from '@rushstack/node-core-library';

/**
 * Represents the internal state of a {@link CharMatcher} subclass.
 *
 * @public
 */
export type CharMatcherState = Brand<unknown, 'CharMatcherState'>;

/**
 * The abstract base class for operations that can be applied by {@link CharMatcherTransform}.
 *
 * @remarks
 * The {@link CharMatcherTransform} applies one or more character rewriting operations to its
 * chunk stream.  Since these operations are applied separately to `stderr` and `stdout`, the
 * state is stored in an opaque `CharMatcherState` object.
 *
 * Conceptually, a `CharMatcher` subclass is very similar to a regular expression, with the difference
 * that `RegExp` operates on a text string, whereas `CharMatcher` operates on a stream of characters.
 *
 * The two most common subclasses are {@link NormalizeNewlinesCharMatcher} and {@link RemoveColorsCharMatcher}.
 *
 * @public
 */
export abstract class CharMatcher {
  public abstract initialize(): CharMatcherState;
  public abstract process(state: CharMatcherState, text: string): string;
  public abstract flush(state: CharMatcherState): string;
}

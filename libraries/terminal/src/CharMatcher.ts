// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/** @beta */
export type CharMatcherState = unknown;

/** @beta */
export abstract class CharMatcher {
  public abstract initialize(): CharMatcherState;
  public abstract process(state: CharMatcherState, text: string): string;
  public abstract flush(state: CharMatcherState): string;
}

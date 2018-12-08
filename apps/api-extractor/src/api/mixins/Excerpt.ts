// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/** @public */
export const enum ExcerptTokenKind {
  Content = 'Content',

  // Soon we will support hyperlinks to other API declarations
  Reference = 'Reference'
}

/** @public */
export interface IExcerptTokenRange {
  startIndex: number;
  endIndex: number;
}

/** @public */
export interface IExcerptToken {
  readonly kind: ExcerptTokenKind;
  text: string;
}

/** @public */
export class ExcerptToken {
  public readonly kind: ExcerptTokenKind;
  public readonly text: string;

  public constructor(kind: ExcerptTokenKind, text: string) {
    this.kind = kind;
    this.text = text;
  }
}

/**
 * This class is used by {@link (ApiDeclarationMixin:interface)} to represent a source code excerpt containing
 * a TypeScript declaration.
 *
 * @remarks
 *
 * The main excerpt is parsed into an array of tokens, and the main excerpt's token range will span all of these
 * tokens.  The declaration may also have have "embedded excerpts", which are other subranges of tokens.
 * For example, if the main excerpt is a function declaration, it may have an embedded excerpt corresponding
 * to the return type of the function.
 *
 * @public
 */
export class Excerpt {
  public readonly tokenRange: Readonly<IExcerptTokenRange>;

  public readonly tokens: ReadonlyArray<ExcerptToken>;

  private _text: string | undefined;

  public constructor(tokens: ReadonlyArray<ExcerptToken>, tokenRange: IExcerptTokenRange) {
    this.tokens = tokens;
    this.tokenRange = tokenRange;

    if (this.tokenRange.startIndex < 0 || this.tokenRange.endIndex > this.tokens.length
      || this.tokenRange.startIndex > this.tokenRange.endIndex) {
      throw new Error('Invalid token range');
    }
  }

  public get text(): string {
    if (this._text === undefined) {
      this._text = this.tokens.slice(this.tokenRange.startIndex, this.tokenRange.endIndex)
      .map(x => x.text).join('');
    }
    return this._text;
  }
}

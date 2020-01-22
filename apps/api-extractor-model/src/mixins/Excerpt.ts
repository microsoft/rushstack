// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { DeclarationReference } from '@microsoft/tsdoc/lib/beta/DeclarationReference';
import { Text } from '@microsoft/node-core-library';

/** @public */
export const enum ExcerptTokenKind {
  /**
   * Generic text without any special properties
   */
  Content = 'Content',

  /**
   * A reference to an API declaration
   */
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
  canonicalReference?: string;
}

/** @public */
export class ExcerptToken {
  private readonly _kind: ExcerptTokenKind;
  private readonly _text: string;
  private readonly _canonicalReference: DeclarationReference | undefined;

  public constructor(kind: ExcerptTokenKind, text: string, canonicalReference?: DeclarationReference) {
    this._kind = kind;

    // Standardize the newlines across operating systems. Even though this may deviate from the actual
    // input source file that was parsed, it's useful because the newline gets serialized inside
    // a string literal in .api.json, which cannot be automatically normalized by Git.
    this._text = Text.convertToLf(text);
    this._canonicalReference = canonicalReference;
  }

  public get kind(): ExcerptTokenKind {
    return this._kind;
  }

  public get text(): string {
    return this._text;
  }

  public get canonicalReference(): DeclarationReference | undefined {
    return this._canonicalReference;
  }
}

/**
 * This class is used by {@link ApiDeclaredItem} to represent a source code excerpt containing
 * a TypeScript declaration.
 *
 * @remarks
 *
 * The main excerpt is parsed into an array of tokens, and the main excerpt's token range will span all of these
 * tokens.  The declaration may also have have "captured" excerpts, which are other subranges of tokens.
 * For example, if the main excerpt is a function declaration, it will also have a captured excerpt corresponding
 * to the return type of the function.
 *
 * An excerpt may be empty (i.e. a token range containing zero tokens).  For example, if a function's return value
 * is not explicitly declared, then the returnTypeExcerpt will be empty.  By contrast, a class constructor cannot
 * have a return value, so ApiConstructor has no returnTypeExcerpt property at all.
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

  public get isEmpty(): boolean {
    return this.tokenRange.startIndex === this.tokenRange.endIndex;
  }
}

// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/** @public */
export const enum ExcerptTokenKind {
  Content = 'Content',

  // Soon we will support hyperlinks to other API declarations
  Reference = 'Reference'
}

/** @public */
export type ExcerptName = 'ReturnType' | 'ParameterType' | 'PropertyType' | 'Initializer';

/** @public */
export interface IExcerptTokenRange {
  readonly startIndex: number;
  readonly endIndex: number;
}

/** @public */
export interface IExcerptToken {
  readonly kind: ExcerptTokenKind;
  text: string;
}

/**
 * @remarks
 * This object must be completely JSON serializable, since it is included in IApiDeclarationMixinJson
 * @public
 */
export interface IDeclarationExcerpt {
  excerptTokens: IExcerptToken[];

  embeddedExcerptsByName: { [name: string]: IExcerptTokenRange };
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

/** @public */
export class Excerpt {
  public readonly tokenRange: IExcerptTokenRange;

  public readonly tokens: ReadonlyArray<ExcerptToken>;

  public constructor(tokens: ReadonlyArray<ExcerptToken>, tokenRange: IExcerptTokenRange) {
    this.tokens = tokens;
    this.tokenRange = tokenRange;
  }

  public get text(): string {
    return this.tokens.slice(this.tokenRange.startIndex, this.tokenRange.endIndex)
      .map(x => x.text).join('');
  }
}

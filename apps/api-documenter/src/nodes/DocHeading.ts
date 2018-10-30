// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  IDocNodeParameters,
  DocNode
} from '@microsoft/tsdoc';
import { CustomDocNodeKind } from './CustomDocNodeKind';

/**
 * Constructor parameters for {@link DocHeading}.
 */
export interface IDocHeadingParameters extends IDocNodeParameters {
  title: string;
  level?: number;
}

/**
 * Represents a heading such as an HTML `<h1>` element.
 */
export class DocHeading extends DocNode {
  /** {@inheritDoc} */
  public readonly kind: CustomDocNodeKind = CustomDocNodeKind.Heading;

  public readonly title: string;
  public readonly level: number;

  /**
   * Don't call this directly.  Instead use {@link TSDocParser}
   * @internal
   */
  public constructor(parameters: IDocHeadingParameters) {
    super(parameters);
    this.title = parameters.title;
    this.level = parameters.level !== undefined ? parameters.level : 1;
  }
}

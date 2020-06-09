// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { DocNode, DocNodeContainer, IDocNodeContainerParameters } from '@microsoft/tsdoc';
import { CustomDocNodeKind } from './CustomDocNodeKind';

/**
 * Constructor parameters for {@link DocEmphasisSpan}.
 */
export interface IDocEmphasisSpanParameters extends IDocNodeContainerParameters {
  bold?: boolean;
  italic?: boolean;
}

/**
 * Represents a span of text that is styled with CommonMark emphasis (italics), strong emphasis (boldface),
 * or both.
 */
export class DocEmphasisSpan extends DocNodeContainer {
  public readonly bold: boolean;
  public readonly italic: boolean;

  public constructor(parameters: IDocEmphasisSpanParameters, children?: DocNode[]) {
    super(parameters, children);
    this.bold = !!parameters.bold;
    this.italic = !!parameters.italic;
  }

  /** @override */
  public get kind(): string {
    return CustomDocNodeKind.EmphasisSpan;
  }
}

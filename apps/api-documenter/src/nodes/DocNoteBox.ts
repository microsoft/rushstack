// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  IDocNodeParameters,
  DocNode,
  DocSection
} from '@microsoft/tsdoc';
import { CustomDocNodeKind } from './CustomDocNodeKind';

/**
 * Constructor parameters for {@link DocNoteBox}.
 */
export interface IDocNoteBoxParameters extends IDocNodeParameters {
}

/**
 * Represents a heading such as an HTML `<h1>` element.
 */
export class DocNoteBox extends DocNode {
  /** {@inheritDoc} */
  public readonly kind: CustomDocNodeKind = CustomDocNodeKind.NoteBox;

  public readonly content: DocSection;

  public constructor(parameters: IDocNoteBoxParameters) {
    super(parameters);
    this.content = new DocSection();
  }

  /** @override */
  protected onGetChildNodes(): ReadonlyArray<DocNode | undefined> {
    return [this.content];
  }
}

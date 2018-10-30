// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  IDocNodeParameters,
  DocNode,
  DocSection
} from '@microsoft/tsdoc';
import { CustomDocNodeKind } from './CustomDocNodeKind';

/**
 * Represents a heading such as an HTML `<h1>` element.
 */
export class DocTableCell extends DocNode {
  /** {@inheritDoc} */
  public readonly kind: CustomDocNodeKind = CustomDocNodeKind.TableCell;

  public readonly content: DocSection;

  public constructor() {
    super({});

    this.content = new DocSection();
  }
}

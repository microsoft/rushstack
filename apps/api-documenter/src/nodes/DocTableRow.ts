// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  IDocNodeParameters,
  DocNode,
  DocSection
} from '@microsoft/tsdoc';
import { CustomDocNodeKind } from './CustomDocNodeKind';
import { DocTableCell } from './DocTableCell';

/**
 * Represents a heading such as an HTML `<h1>` element.
 */
export class DocTableRow extends DocNode {
  /** {@inheritDoc} */
  public readonly kind: CustomDocNodeKind = CustomDocNodeKind.TableRow;

  private _cells: DocTableCell[];

  public constructor() {
    super({});
  }

  public get cells(): ReadonlyArray<DocTableCell> {
    return this._cells;
  }

  /** @override */
  protected onGetChildNodes(): ReadonlyArray<DocNode | undefined> {
    return this._cells;
  }
}

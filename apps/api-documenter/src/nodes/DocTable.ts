// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  IDocNodeParameters,
  DocNode,
  DocSection
} from '@microsoft/tsdoc';
import { CustomDocNodeKind } from './CustomDocNodeKind';
import { DocTableRow } from './DocTableRow';

/**
 * Represents a heading such as an HTML `<h1>` element.
 */
export class DocTable extends DocNode {
  /** {@inheritDoc} */
  public readonly kind: CustomDocNodeKind = CustomDocNodeKind.Table;

  public readonly header: DocTableRow;

  private _rows: DocTableRow[];

  public constructor() {
    super({});

    this.header = new DocTableRow();
    this._rows = [];
  }

  public get rows(): ReadonlyArray<DocTableRow> {
    return this._rows;
  }

  /** @override */
  protected onGetChildNodes(): ReadonlyArray<DocNode | undefined> {
    return [this.header, ...this._rows];
  }
}

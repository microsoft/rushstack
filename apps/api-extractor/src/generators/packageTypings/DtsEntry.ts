// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AstSymbol } from './AstSymbol';
import { ReleaseTag } from '../../aedoc/ReleaseTag';

export interface IDtsEntryParameters {
  readonly astSymbol: AstSymbol;
  readonly originalName: string;
  readonly exported: boolean;
  readonly releaseTag: ReleaseTag;
}

export class DtsEntry {
  public readonly astSymbol: AstSymbol;
  public readonly originalName: string;
  public readonly exported: boolean;
  public readonly releaseTag: ReleaseTag;

  private _nameForEmit: string | undefined = undefined;

  private _sortKey: string | undefined = undefined;

  public constructor(parameters: IDtsEntryParameters) {
    this.astSymbol = parameters.astSymbol;
    this.originalName = parameters.originalName;
    this.exported = parameters.exported;
    this.releaseTag = parameters.releaseTag;
  }

  /**
   * The originalName, possibly renamed to ensure that all the top-level exports have unique names.
   */
  public get nameForEmit(): string | undefined {
    return this._nameForEmit;
  }

  public set nameForEmit(value: string | undefined) {
    this._nameForEmit = value;
    this._sortKey = undefined; // invalidate the cached value
  }

  public getSortKey(): string {
    if (!this._sortKey) {
      const name: string = this.nameForEmit || this.originalName;
      if (name.substr(0, 1) === '_') {
        // Removes the leading underscore, for example: "_example" --> "example*"
        // This causes internal definitions to sort alphabetically with regular definitions.
        // The star is appended to preserve uniqueness, since "*" is not a legal  identifier character.
        this._sortKey = name.substr(1) + '*';
      } else {
        this._sortKey = name;
      }
    }
    return this._sortKey;
  }
}

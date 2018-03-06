// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ReleaseTag } from '../../aedoc/ReleaseTag';
import * as ts from 'typescript';

/**
 * Constructor parameters for the Entry class
 */
export interface IEntryParameters {
  // (see documentation for the corresponding properties in the Entry class)
  localName: string;
  followedSymbol: ts.Symbol;
  importPackagePath: string | undefined;
  importPackageExportName: string | undefined;
  importPackageKey: string | undefined;
  releaseTag: ReleaseTag;
}

/**
 * An "Entry" is a type definition that we encounter while traversing the
 * references from the package entry point.  This data structure helps filter,
 * sort, and rename the entries that end up in the output package typings file.
 */
export class Entry {
  /**
   * The original name of the symbol, as exported from the module (i.e. source file)
   * containing the original TypeScript definition.
   */
  public readonly localName: string;

  /**
   * If this entry is a top-level export of the package that we are analyzing, then its
   * name is stored here.  In this case, the uniqueName must be the same as packageExportName.
   * @remarks
   * Since Entry objects are collected via a depth first search, we may encounter it
   * before we realize that it is a package export; the packageExportName property is not
   * accurate until the collection phase has completed.
   */
  public packageExportName: string | undefined;

  /**
   * The localName, possibly renamed to ensure that all the top-level exports have unique names.
   */
  public get uniqueName(): string | undefined {
    return this._uniqueName;
  }

  public set uniqueName(value: string | undefined) {
    this._uniqueName = value;
    this._sortKey = undefined; // invalidate the cached value
  }

  /**
   * The compiler symbol where this type was defined, after following any aliases.
   */
  public readonly followedSymbol: ts.Symbol;

  /**
   * The name of the external package (and possibly module path) that this definition
   * was imported from.  If it was defined in the referencing source file, or if it was
   * imported from a local file, or if it is an ambient definition, then externalPackageName
   * will be undefined.
   *
   * Example: "@microsoft/gulp-core-build/lib/IBuildConfig"
   */
  public readonly importPackagePath: string | undefined;

  /**
   * If importPackagePath is defined, then this specifies the export name for the definition.
   *
   * Example: "IBuildConfig"
   */
  public readonly importPackageExportName: string | undefined;

  /**
   * If importPackagePath and importPackageExportName are defined, then this is a dictionary key
   * that combines them with a colon (":").
   *
   * Example: "@microsoft/gulp-core-build/lib/IBuildConfig:IBuildConfig"
   */
  public readonly importPackageKey: string | undefined;

  /**
   * The release tag parsed from the doc comments for this Entry.
   */
  public readonly releaseTag: ReleaseTag;

  /**
   * If true, this entry should be emitted using the "export" keyword instead of the "declare" keyword.
   */
  public exported: boolean = false;

  private _uniqueName: string | undefined = undefined;
  private _sortKey: string|undefined = undefined;

  public constructor(parameters: IEntryParameters) {
    this.localName = parameters.localName;
    this.followedSymbol = parameters.followedSymbol;
    this.importPackagePath = parameters.importPackagePath;
    this.importPackageExportName = parameters.importPackageExportName;
    this.importPackageKey = parameters.importPackageKey;
    this.releaseTag = parameters.releaseTag;
  }

  public getSortKey(): string {
    if (!this._sortKey) {
      const name: string = this.uniqueName || this.localName;
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

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
 * Indicates how this Entry will be processed when emitting the *.d.ts file.
 */
export const enum EntryRole {
  /**
   * The item will be a top-level definition in the emitted *.d.ts file.
   */
  EmittedDefinition = 'EmittedDefinition',

  /**
   * The item will be emitted as an import statement.  It is declared in
   * a dependency package.
   */
  EmittedImport = 'EmittedImport',

  /**
   * The item is a nested part of its Entry.parent.  Its role will be determined
   * by the root parent.
   */
  Child = 'Child'
}

/**
 * An "Entry" represents an API item such as a class member, interface, or namespace.
 *
 * @remarks
 * We only model items that the PackageTypingsGenerator could potentially trim, e.g.
 * function parameters and literal types are not represented.  It is a semantic unit
 * (i.e. ts.Symbol not ts.Node), so a single Entry may emit multiple definitions.
 * For nested API items (e.g. a member inside a class inside a namespace), the parent
 * chain is always populated, but children are only added on demand.
 *
 * During analysis, "Entry" objects have three possible roles, represented by the
 * EntryRole enum.
 */
export class Entry {
  // ------------------------------------------------------------------------
  // IMMUTABLE STATE

  public readonly role: EntryRole;

  /**
   * The original name of the symbol, as exported from the module (i.e. source file)
   * containing the original TypeScript definition.
   */
  public readonly localName: string;

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

  // ------------------------------------------------------------------------
  // MUTABLE STATE

  /**
   * If this entry is a top-level export of the package that we are analyzing, then its
   * name is stored here.  In this case, the uniqueName must be the same as packageExportName.
   * @remarks
   * Since Entry objects are collected via a depth first search, we may encounter it
   * before we realize that it is a package export; the packageExportName property is not
   * accurate until the collection phase has completed.
   */
  public get packageExportName(): string | undefined {
    return this._packageExportName;
  }

  public set packageExportName(value: string | undefined) {
    this._role = EntryRole.EmittedDefinition;
    this._packageExportName = value;
  }

  /**
   * Indicates that the item must be emitted as a definition in the *.d.ts file but
   * without an "export" keyword.  If so, then:
   * - The API file will warn the developer that they referenced this type but forgot
   *   to export it
   * - The uniqueName may get renamed to avoid conflicts with the explicit exports
   *
   * NOTE: During analysis, the packageExportName can be assigned after the constructor
   * is called.  If this happens, the forgottenExport state will change.
   */
  public get forgottenExport(): boolean {
    return this.role === EntryRole.EmittedDefinition && !this.packageExportName;
  }

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

  private _uniqueName: string | undefined = undefined;
  private _sortKey: string|undefined = undefined;
  private _packageExportName: string | undefined;
  private _role: EntryRole;

  public constructor(parameters: IEntryParameters) {
    this.localName = parameters.localName;
    this.followedSymbol = parameters.followedSymbol;
    this.importPackagePath = parameters.importPackagePath;
    this.importPackageExportName = parameters.importPackageExportName;
    this.importPackageKey = parameters.importPackageKey;
    this.releaseTag = parameters.releaseTag;

    if (this.importPackagePath) {
      this.role = EntryRole.EmittedImport;
    } else {
      this.role = EntryRole.EmittedDefinition;
    }
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

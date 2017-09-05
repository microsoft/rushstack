// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  ApiJsonGenerator,
  IApiPackage,
  ApiItem
} from '@microsoft/api-extractor';
import { JsonFile } from '@microsoft/node-core-library';

export enum DocItemKind {
  Package,
  Class,
  Interface,
  Method,
  Constructor,
  Function,
  Property,
  Enum
}

/**
 * Tracks additional metadata for an ApiItem while generating documentation.
 *
 * @remarks
 *
 * The api-documenter tool reads a tree of ApiItem objects from *.api.json files, and then
 * generates documentation output.  To facilitate this process, a DocItem object is created
 * for each hyperlinkable ApiItem (i.e. major types such as package, class, member, etc).
 * The DocItems track the parent/child hierarchy, which is used for scenarios such as:
 *
 * - Preventing broken links, by checking that a referenced object is part of the documentation set
 *   before generating a link
 * - Detecting the base classes and derived classes for a class
 * - Walking the parent chain to build a unique documentation ID for each item
 *
 * The set of DocItem objects is managed by DocItemSet.
 */
export class DocItem {
  public readonly kind: DocItemKind;

  public readonly apiItem: ApiItem;
  public readonly name: string;

  public readonly docItemSet: DocItemSet;
  public readonly parent: DocItem | undefined;
  public readonly children: DocItem[] = [];

  public constructor(apiItem: ApiItem, name: string, docItemSet: DocItemSet,
    parent: DocItem | undefined) {

    this.apiItem = apiItem;
    this.name = name;
    this.docItemSet = docItemSet;

    switch (this.apiItem.kind) {
      case 'package':
        this.kind = DocItemKind.Package;
        for (const exportName of Object.keys(this.apiItem.exports)) {
          const child: ApiItem = this.apiItem.exports[exportName];
          this.children.push(new DocItem(child, exportName, this.docItemSet, this));
        }
        break;

      case 'class':
      case 'interface':
        this.kind = this.apiItem.kind === 'class' ? DocItemKind.Class : DocItemKind.Interface;
        for (const memberName of Object.keys(this.apiItem.members)) {
          const child: ApiItem = this.apiItem.members[memberName];
          this.children.push(new DocItem(child, memberName, this.docItemSet, this));
        }
        break;

        case 'method':
          this.kind = DocItemKind.Method;
          break;
        case 'constructor':
          this.kind = DocItemKind.Constructor;
          break;
        case 'function':
          this.kind = DocItemKind.Function;
          break;
        case 'property':
          this.kind = DocItemKind.Property;
          break;
        case 'enum':
          this.kind = DocItemKind.Enum;
          break;
        default:
          throw new Error('Unsupported item kind: ' + (this.apiItem as ApiItem).kind);
    }

    this.parent = parent;
  }

  /**
   * Returns the parent chain in reverse order, i.e. starting with the root of the tree
   * (which is the package).
   */
  public getHierarchy(): DocItem[] {
    const result: DocItem[] = [];
    for (let current: DocItem | undefined = this; current; current = current.parent) {
      result.unshift(current);
    }
    return result;
  }
}

/**
 * The collection of DocItem objects that api-documenter is processing.
 *
 * @remarks
 *
 * The DocItemSet is built by repeatedly calling loadApiJsonFile() for each file that we want
 * to process.  After all files are loaded, calculateReferences() is used to calculate
 * cross-references and build up the indexes.
 */
export class DocItemSet {
  public readonly docPackagesByName: Map<string, DocItem> = new Map<string, DocItem>();
  public readonly docPackages: DocItem[] = [];
  private _calculated: boolean = false;

  public loadApiJsonFile(apiJsonFilename: string): void {
    if (this._calculated) {
      throw new Error('calculateReferences() was already called');
    }

    const docPackage: IApiPackage = JsonFile.loadAndValidate(apiJsonFilename, ApiJsonGenerator.jsonSchema, {
      customErrorHeader: 'The API JSON file does not conform to the expected schema.\n'
      + '(Was it created by an incompatible release of API Extractor?)'
    });

    const docItem: DocItem = new DocItem(docPackage, docPackage.name, this, undefined);
    this.docPackagesByName.set(docPackage.name, docItem);
    this.docPackages.push(docItem);
  }

  public calculateReferences(): void {
    if (this._calculated) {
      return;
    }
    for (const docPackage of this.docPackages) {
      this._calculateReferences(docPackage);
    }
  }

  private _calculateReferences(docItem: DocItem): void {
    // (Calculate base classes and child classes)

    for (const child of docItem.children) {
      this._calculateReferences(child);
    }
  }
}

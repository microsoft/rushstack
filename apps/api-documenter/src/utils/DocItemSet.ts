// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { PackageName } from '@microsoft/node-core-library';
import {
  IApiPackage,
  ApiItem,
  ApiJsonFile,
  IApiItemReference
} from '@microsoft/api-extractor';

export enum DocItemKind {
  Package,
  Namespace,
  Class,
  Interface,
  Method,
  Constructor,
  Function,
  Property,
  Enum,
  EnumMember
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
      case 'namespace':
        this.kind = this.apiItem.kind === 'package' ? DocItemKind.Package : DocItemKind.Namespace;
        for (const exportName of Object.keys(this.apiItem.exports)) {
          const child: ApiItem = this.apiItem.exports[exportName];
          this.children.push(new DocItem(child, exportName, this.docItemSet, this));
        }
        break;

      case 'class':
      case 'interface':
        this.kind = this.apiItem.kind === 'class' ? DocItemKind.Class : DocItemKind.Interface;
        if (this.apiItem.members) {
          for (const memberName of Object.keys(this.apiItem.members)) {
            const child: ApiItem = this.apiItem.members[memberName];
            this.children.push(new DocItem(child, memberName, this.docItemSet, this));
          }
        }
        break;

      case 'method':
        this.kind = DocItemKind.Method;
        break;
      case 'constructor':
        this.kind = DocItemKind.Constructor;
        this.name = 'constructor';
        break;
      case 'function':
        this.kind = DocItemKind.Function;
        break;
      case 'property':
        this.kind = DocItemKind.Property;
        break;
      case 'enum':
        this.kind = DocItemKind.Enum;
        if (this.apiItem.values) {
          for (const memberName of Object.keys(this.apiItem.values)) {
            const child: ApiItem = this.apiItem.values[memberName];
            this.children.push(new DocItem(child, memberName, this.docItemSet, this));
          }
        }
        break;
      case 'enum value':
        this.kind = DocItemKind.EnumMember;
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

  public getApiReference(): IApiItemReference {
    const reference: IApiItemReference = {
      scopeName: '',
      packageName: '',
      exportName: '',
      memberName: ''
    };
    let i: number = 0;
    for (const docItem of this.getHierarchy()) {
      switch (i) {
        case 0:
          reference.scopeName = PackageName.getScope(docItem.name);
          reference.packageName = PackageName.getUnscopedName(docItem.name);
          break;
        case 1:
          reference.exportName = docItem.name;
          break;
        case 2:
          reference.memberName = docItem.name;
          break;
        default:
          throw new Error('Unable to create API reference for ' + this.name);
      }
      ++i;
    }
    return reference;
  }

  public tryGetChild(name: string): DocItem | undefined {
    for (const child of this.children) {
      if (child.name === name) {
        return child;
      }
    }
    return undefined;
  }
}

/**
 * Return value for DocItemSet.resolveApiItemReference()
 */
export interface IDocItemSetResolveResult {
  /**
   * The matching DocItem object, if found.
   */
  docItem: DocItem | undefined;

  /**
   * The closest matching parent DocItem, if any.
   */
  closestMatch: DocItem | undefined;
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

    const apiPackage: IApiPackage = ApiJsonFile.loadFromFile(apiJsonFilename);

    const docItem: DocItem = new DocItem(apiPackage, apiPackage.name, this, undefined);
    this.docPackagesByName.set(apiPackage.name, docItem);
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

  /**
   * Attempts to find the DocItem described by an IApiItemReference.  If no matching item is
   * found, then undefined is returned.
   */
  public resolveApiItemReference(reference: IApiItemReference): IDocItemSetResolveResult {
    const result: IDocItemSetResolveResult = {
      docItem: undefined,
      closestMatch: undefined
    };

    const packageName: string = PackageName.combineParts(reference.scopeName, reference.packageName);

    let current: DocItem | undefined = undefined;

    for (const nameToMatch of [packageName, reference.exportName, reference.memberName]) {
      if (!nameToMatch) {
        // Success, since we ran out of stuff to match
        break;
      }

      // Is this the first time through the loop?
      if (!current) {
        // Yes, start with the package
        current = this.docPackagesByName.get(nameToMatch);
      } else {
        // No, walk the tree
        current = current.tryGetChild(nameToMatch);
      }

      if (!current) {
        return result;  // no match; result.closestMatch has the closest match
      }

      result.closestMatch = current;
    }

    result.docItem = result.closestMatch;
    return result;
  }

  private _calculateReferences(docItem: DocItem): void {
    // (Calculate base classes and child classes)

    for (const child of docItem.children) {
      this._calculateReferences(child);
    }
  }
}

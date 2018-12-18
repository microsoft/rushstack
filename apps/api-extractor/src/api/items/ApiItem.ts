// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Constructor, PropertiesOf } from '../mixins/Mixin';
import { ApiParameterListMixin } from '../mixins/ApiParameterListMixin';
import { ApiPackage } from '../model/ApiPackage';

/**
 * The type returned by the {@link ApiItem.kind} property, which can be used to easily distinguish subclasses of
 * {@link ApiItem}.
 *
 * @public
 */
export const enum ApiItemKind {
  CallSignature = 'CallSignature',
  Class = 'Class',
  Constructor = 'Constructor',
  ConstructSignature = 'ConstructSignature',
  EntryPoint = 'EntryPoint',
  Enum = 'Enum',
  EnumMember = 'EnumMember',
  Function = 'Function',
  IndexSignature = 'IndexSignature',
  Interface = 'Interface',
  Method = 'Method',
  MethodSignature = 'MethodSignature',
  Model = 'Model',
  Namespace = 'Namespace',
  Package = 'Package',
  Parameter = 'Parameter',
  Property = 'Property',
  PropertySignature = 'PropertySignature',
  TypeAlias = 'TypeAlias',
  VariableDeclaration = 'VariableDeclaration',
  None = 'None'
}

/**
 * Constructor options for {@link ApiItem}.
 * @public
 */
export interface IApiItemOptions {
  name: string;
}

export interface IApiItemJson {
  name: string;
  kind: ApiItemKind;
  canonicalReference: string;
}

/**
 * PRIVATE
 * Allows ApiItemContainerMixin to assign the parent.
 */
// tslint:disable-next-line:variable-name
export const ApiItem_parent: unique symbol = Symbol('ApiItem._parent');

/**
 * The abstract base class for all members of an `ApiModel` object.
 *
 * @remarks
 * This is part of the {@link ApiModel} hierarchy of classes, which are serializable representations of
 * API declarations.
 * @public
 */
export class ApiItem {
  public [ApiItem_parent]: ApiItem | undefined;

  private readonly _name: string;

  public static deserialize(jsonObject: IApiItemJson): ApiItem {
    // tslint:disable-next-line:no-use-before-declare
    return Deserializer.deserialize(jsonObject);
  }

  /** @virtual */
  public static onDeserializeInto(options: Partial<IApiItemOptions>, jsonObject: IApiItemJson): void {
    options.name = jsonObject.name;
  }

  public constructor(options: IApiItemOptions) {
    this._name = options.name;
  }

  /** @virtual */
  public serializeInto(jsonObject: Partial<IApiItemJson>): void {
    jsonObject.kind = this.kind;
    jsonObject.name = this.name;
    jsonObject.canonicalReference = this.canonicalReference;
  }

  /** @virtual */
  public get kind(): ApiItemKind {
    throw new Error('ApiItem.kind was not implemented by the child class');
  }

  public get name(): string {
    return this._name;
  }

  /** @virtual */
  public get canonicalReference(): string {
    throw new Error('ApiItem.canonicalReference was not implemented by the child class');
  }

  /**
   * If this item was added to a ApiItemContainerMixin item, then this returns the container item.
   * If this is an ApiParameter that was added to a method or function, then this returns the function item.
   * Otherwise, it returns undefined.
   * @virtual
   */
  public get parent(): ApiItem | undefined {
    return this[ApiItem_parent];
  }

  /**
   * This property supports a visitor pattern for walking the tree.
   * For items with ApiItemContainerMixin, it returns the contained items.
   * Otherwise it returns an empty array.
   * @virtual
   */
  public get members(): ReadonlyArray<ApiItem> {
    return [];
  }

  /**
   * Returns the chain of ancestors, starting from the root of the tree, and ending with the this item.
   */
  public getHierarchy(): ReadonlyArray<ApiItem> {
    const hierarchy: ApiItem[] = [];
    for (let current: ApiItem | undefined = this; current !== undefined; current = current.parent) {
      hierarchy.push(current);
    }
    hierarchy.reverse();
    return hierarchy;
  }

  /**
   * This returns a scoped name such as `"Namespace1.Namespace2.MyClass.myMember()"`.  It does not include the
   * package name or entry point.
   *
   * @remarks
   * If called on an ApiEntrypoint, ApiPackage, or ApiModel item, the result is an empty string.
   */
  public getScopedNameWithinPackage(): string {
    const reversedParts: string[] = [];

    for (let current: ApiItem | undefined = this; current !== undefined; current = current.parent) {
      if (current.kind === ApiItemKind.Model
        || current.kind === ApiItemKind.Package
        || current.kind === ApiItemKind.EntryPoint) {
        break;
      }
      if (reversedParts.length !== 0) {
        reversedParts.push('.');
      } else if (ApiParameterListMixin.isBaseClassOf(current)) { // tslint:disable-line:no-use-before-declare
        reversedParts.push('()');
      }
      reversedParts.push(current.name);
    }

    return reversedParts.reverse().join('');
  }

  /**
   * If this item is an ApiPackage or has an ApiPackage as one of its parents, then that object is returned.
   * Otherwise undefined is returned.
   */
  public getAssociatedPackage(): ApiPackage | undefined {
    for (let current: ApiItem | undefined = this; current !== undefined; current = current.parent) {
      if (current.kind === ApiItemKind.Package) {
        return current as ApiPackage;
      }
    }
    return undefined;
  }

  /** @virtual */
  public getSortKey(): string {
    return this.canonicalReference;
  }
}

// For mixins
export interface IApiItemConstructor extends Constructor<ApiItem>, PropertiesOf<typeof ApiItem> { }

// Circular import
import { Deserializer } from '../model/Deserializer';

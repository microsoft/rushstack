// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.s

import {
  ApiItem,
  apiItem_onParentChanged,
  IApiItemJson,
  IApiItemOptions,
  IApiItemConstructor,
  ApiItemKind
} from '../items/ApiItem';
import { ApiNameMixin } from './ApiNameMixin';
import { DeserializerContext } from '../model/DeserializerContext';
import { InternalError } from '@microsoft/node-core-library';

/**
 * Constructor options for {@link (ApiItemContainerMixin:interface)}.
 * @public
 */
export interface IApiItemContainerMixinOptions extends IApiItemOptions {
  members?: ApiItem[];
}

export interface IApiItemContainerJson extends IApiItemJson {
  members: IApiItemJson[];
}

const _members: unique symbol = Symbol('ApiItemContainerMixin._members');
const _membersSorted: unique symbol = Symbol('ApiItemContainerMixin._membersSorted');
const _membersByContainerKey: unique symbol = Symbol('ApiItemContainerMixin._membersByContainerKey');
const _membersByName: unique symbol = Symbol('ApiItemContainerMixin._membersByName');
const _membersByKind: unique symbol = Symbol('ApiItemContainerMixin._membersByKind');

/**
 * The mixin base class for API items that act as containers for other child items.
 *
 * @remarks
 *
 * This is part of the {@link ApiModel} hierarchy of classes, which are serializable representations of
 * API declarations.  The non-abstract classes (e.g. `ApiClass`, `ApiEnum`, `ApiInterface`, etc.) use
 * TypeScript "mixin" functions (e.g. `ApiDeclaredItem`, `ApiItemContainerMixin`, etc.) to add various
 * features that cannot be represented as a normal inheritance chain (since TypeScript does not allow a child class
 * to extend more than one base class).  The "mixin" is a TypeScript merged declaration with three components:
 * the function that generates a subclass, an interface that describes the members of the subclass, and
 * a namespace containing static members of the class.
 *
 * Examples of `ApiItemContainerMixin` child classes include `ApiModel`, `ApiPackage`, `ApiEntryPoint`,
 * and `ApiEnum`.  But note that `Parameter` is not considered a "member" of an `ApiMethod`; this relationship
 * is modeled using {@link (ApiParameterListMixin:interface).parameters} instead
 * of {@link (ApiItemContainerMixin:interface).members}.
 *
 * @public
 */
// eslint-disable-next-line @typescript-eslint/interface-name-prefix
export interface ApiItemContainerMixin extends ApiItem {
  /**
   * Returns the members of this container, sorted alphabetically.
   */
  readonly members: ReadonlyArray<ApiItem>;

  /**
   * Adds a new member to the container.
   *
   * @remarks
   * An ApiItem cannot be added to more than one container.
   */
  addMember(member: ApiItem): void;

  /**
   * Attempts to retrieve a member using its containerKey, or returns `undefined` if no matching member was found.
   *
   * @remarks
   * Use the `getContainerKey()` static member to construct the key.  Each subclass has a different implementation
   * of this function, according to the aspects that are important for identifying it.
   *
   * See {@link ApiItem.containerKey} for more information.
   */
  tryGetMemberByKey(containerKey: string): ApiItem | undefined;

  /**
   * Returns a list of members with the specified name.
   */
  findMembersByName(name: string): ReadonlyArray<ApiItem>;

  /**
   * For a given member of this container, return its `ApiItem.getMergedSiblings()` list.
   * @internal
   */
  _getMergedSiblingsForMember(memberApiItem: ApiItem): ReadonlyArray<ApiItem>;

  /** @override */
  serializeInto(jsonObject: Partial<IApiItemJson>): void;
}

/**
 * Mixin function for {@link ApiDeclaredItem}.
 *
 * @param baseClass - The base class to be extended
 * @returns A child class that extends baseClass, adding the {@link (ApiItemContainerMixin:interface)} functionality.
 *
 * @public
 */
export function ApiItemContainerMixin<TBaseClass extends IApiItemConstructor>(baseClass: TBaseClass):
  TBaseClass & (new (...args: any[]) => ApiItemContainerMixin) { // eslint-disable-line @typescript-eslint/no-explicit-any

  abstract class MixedClass extends baseClass implements ApiItemContainerMixin {
    public readonly [_members]: ApiItem[];
    public [_membersSorted]: boolean;
    public [_membersByContainerKey]: Map<string, ApiItem>;

    // For members of this container that extend ApiNameMixin, this stores the list of members with a given name.
    // Examples include merged declarations, overloaded functions, etc.
    public [_membersByName]: Map<string, ApiItem[]> | undefined;

    // For members of this container that do NOT extend ApiNameMixin, this stores the list of members
    // that share a common ApiItemKind.  Examples include overloaded constructors or index signatures.
    public [_membersByKind]: Map<string, ApiItem[]> | undefined;  // key is ApiItemKind

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public constructor(...args: any[]) {
      super(...args);
      const options: IApiItemContainerMixinOptions = args[0] as IApiItemContainerMixinOptions;

      this[_members] = [];
      this[_membersByContainerKey] = new Map<string, ApiItem>();

      if (options.members) {
        for (const member of options.members) {
          this.addMember(member);
        }
      }
    }

    /** @override */
    public static onDeserializeInto(options: Partial<IApiItemContainerMixinOptions>,
      context: DeserializerContext, jsonObject: IApiItemContainerJson): void {

      baseClass.onDeserializeInto(options, context, jsonObject);

      options.members = [];
      for (const memberObject of jsonObject.members) {
        options.members.push(ApiItem.deserialize(memberObject, context));
      }
    }

    public get members(): ReadonlyArray<ApiItem> {
      if (!this[_membersSorted]) {
        this[_members].sort((x, y) => x.getSortKey().localeCompare(y.getSortKey()));
        this[_membersSorted] = true;
      }

      return this[_members];
    }

    public addMember(member: ApiItem): void {
      if (this[_membersByContainerKey].has(member.containerKey)) {
        throw new Error(`Another member has already been added with the same name (${member.displayName})` +
          ` and containerKey (${member.containerKey})`);
      }

      const existingParent: ApiItem | undefined = member.parent;
      if (existingParent !== undefined) {
        throw new Error(`This item has already been added to another container: "${existingParent.displayName}"`);
      }

      this[_members].push(member);
      this[_membersByName] = undefined; // invalidate the lookup
      this[_membersByKind] = undefined; // invalidate the lookup
      this[_membersSorted] = false;
      this[_membersByContainerKey].set(member.containerKey, member);

      member[apiItem_onParentChanged](this);
    }

    public tryGetMemberByKey(containerKey: string): ApiItem | undefined {
      return this[_membersByContainerKey].get(containerKey);
    }

    public findMembersByName(name: string): ReadonlyArray<ApiItem> {
      this._ensureMemberMaps();
      return this[_membersByName]!.get(name) || [];
    }

    /** @internal */
    public _getMergedSiblingsForMember(memberApiItem: ApiItem): ReadonlyArray<ApiItem> {
      this._ensureMemberMaps();
      let result: ApiItem[] | undefined;
      if (ApiNameMixin.isBaseClassOf(memberApiItem)) {
        result = this[_membersByName]!.get(memberApiItem.name);
      } else {
        result = this[_membersByKind]!.get(memberApiItem.kind);
      }
      if (!result) {
        throw new InternalError('Item was not found in the _membersByName/_membersByKind lookup');
      }
      return result;
    }

    /** @internal */
    public _ensureMemberMaps(): void {
      // Build the _membersByName and _membersByKind tables if they don't already exist
      if (this[_membersByName] === undefined) {
        const membersByName: Map<string, ApiItem[]> = new Map<string, ApiItem[]>();
        const membersByKind: Map<string, ApiItem[]> = new Map<string, ApiItem[]>();

        for (const member of this[_members]) {
          let map: Map<string, ApiItem[]> | Map<ApiItemKind, ApiItem[]>;
          let key: string | ApiItemKind;

          if (ApiNameMixin.isBaseClassOf(member)) {
            map = membersByName;
            key = member.name;
          } else {
            map = membersByKind;
            key = member.kind;
          }

          let list: ApiItem[] | undefined = map.get(key);
          if (list === undefined) {
            list = [];
            map.set(key, list);
          }
          list.push(member);
        }

        this[_membersByName] = membersByName;
        this[_membersByKind] = membersByKind;
      }
    }

    /** @override */
    public serializeInto(jsonObject: Partial<IApiItemContainerJson>): void {
      super.serializeInto(jsonObject);

      const memberObjects: IApiItemJson[] = [];

      for (const member of this.members) {
        const memberJsonObject: Partial<IApiItemJson> = {};
        member.serializeInto(memberJsonObject);
        memberObjects.push(memberJsonObject as IApiItemJson);
      }

      jsonObject.members = memberObjects;
    }
  }

  return MixedClass;
}

/**
 * Static members for {@link (ApiItemContainerMixin:interface)}.
 * @public
 */
export namespace ApiItemContainerMixin {
  /**
   * A type guard that tests whether the specified `ApiItem` subclass extends the `ApiItemContainerMixin` mixin.
   *
   * @remarks
   *
   * The JavaScript `instanceof` operator cannot be used to test for mixin inheritance, because each invocation of
   * the mixin function produces a different subclass.  (This could be mitigated by `Symbol.hasInstance`, however
   * the TypeScript type system cannot invoke a runtime test.)
   */
  export function isBaseClassOf(apiItem: ApiItem): apiItem is ApiItemContainerMixin {
    return apiItem.hasOwnProperty(_members);
  }
}

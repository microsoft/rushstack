// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.s

import { Constructor, Mixin } from './Mixin';
import { ApiItem, SerializedApiItem, IApiItemParameters } from '../model/ApiItem';

// tslint:disable-next-line:interface-name
export interface ApiItemContainerMixin {
  readonly members: ReadonlyArray<ApiItem>;
  addMember(member: ApiItem): void;

  tryGetMember(name: string, canonicalReference: string): ApiItem | undefined;

  /** @override */
  serializeInto(jsonObject: Partial<SerializedApiItem<IApiItemParameters>>): void;
}

export interface IApiItemContainer extends ApiItemContainerMixin, ApiItem {
}

const _members: unique symbol = Symbol('_members');
const _membersSorted: unique symbol = Symbol('_membersSorted');
const _membersByKey: unique symbol = Symbol('_membersByKey');
const _getKey: unique symbol = Symbol('_getKey');

export function ApiItemContainerMixin<TBaseClass extends Constructor<ApiItem>>(baseClass: TBaseClass):
  Mixin<TBaseClass, ApiItemContainerMixin> {

  abstract class MixedClass extends baseClass implements ApiItemContainerMixin {
    public readonly [_members]: ApiItem[];
    public [_membersSorted]: boolean;
    public [_membersByKey]: Map<string, ApiItem>;

    public static [_getKey](name: string, canonicalReference: string): string {
      return `${name}:${canonicalReference}`;
    }

    // tslint:disable-next-line:no-any
    constructor(...args: any[]) {
      super(...args);
      this[_members] = [];
      this[_membersByKey] = new Map<string, ApiItem>();
    }

    public get members(): ReadonlyArray<ApiItem> {
      if (!this[_membersSorted]) {
        this[_members].sort((x, y) => x.getSortKey().localeCompare(y.getSortKey()));
        this[_membersSorted] = true;
      }

      return this[_members];
    }

    public addMember(member: ApiItem): void {
      const key: string = MixedClass[_getKey](member.name, member.canonicalReference);

      if (this[_membersByKey].has(key)) {
        throw new Error('Another member has already been added with the same name and canonicalReference');
      }

      this[_members].push(member);
      this[_membersSorted] = false;
      this[_membersByKey].set(key, member);
    }

    public tryGetMember(name: string, canonicalReference: string): ApiItem | undefined {
      const key: string = MixedClass[_getKey](name, canonicalReference);
      return this[_membersByKey].get(key);
    }

    /** @override */
    public serializeInto(jsonObject: Partial<SerializedApiItem<IApiItemParameters>>): void {
      super.serializeInto(jsonObject);

      const memberObjects: Partial<SerializedApiItem<IApiItemParameters>>[] = [];

      for (const member of this.members) {
        const memberJsonObject: Partial<SerializedApiItem<IApiItemParameters>> = {};
        member.serializeInto(memberJsonObject);
        memberObjects.push(memberJsonObject);
      }

      jsonObject.members = memberObjects as SerializedApiItem<IApiItemParameters>[];
    }
  }

  return MixedClass;
}

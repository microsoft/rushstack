// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.s

import { Constructor, Mixin } from './Mixin';
import { ApiItem, IApiItemJson } from '../model/ApiItem';

export interface IApiItemContainerMixinJson extends IApiItemJson {
  members: IApiItemJson[];
}

const _members: unique symbol = Symbol('_members');
const _membersSorted: unique symbol = Symbol('_membersSorted');
const _membersByCanonicalReference: unique symbol = Symbol('_membersByCanonicalReference');

// tslint:disable-next-line:interface-name
export interface ApiItemContainerMixin {
  readonly members: ReadonlyArray<ApiItem>;
  addMember(member: ApiItem): void;

  tryGetMember(canonicalReference: string): ApiItem | undefined;

  /** @override */
  serializeInto(jsonObject: Partial<IApiItemJson>): void;
}

export function ApiItemContainerMixin<TBaseClass extends Constructor<ApiItem>>(baseClass: TBaseClass):
  Mixin<TBaseClass, ApiItemContainerMixin> {

  abstract class MixedClass extends baseClass implements ApiItemContainerMixin {
    public readonly [_members]: ApiItem[];
    public [_membersSorted]: boolean;
    public [_membersByCanonicalReference]: Map<string, ApiItem>;

    // tslint:disable-next-line:no-any
    constructor(...args: any[]) {
      super(...args);
      this[_members] = [];
      this[_membersByCanonicalReference] = new Map<string, ApiItem>();
    }

    public get members(): ReadonlyArray<ApiItem> {
      if (!this[_membersSorted]) {
        this[_members].sort((x, y) => x.getSortKey().localeCompare(y.getSortKey()));
        this[_membersSorted] = true;
      }

      return this[_members];
    }

    public addMember(member: ApiItem): void {
      if (this[_membersByCanonicalReference].has(member.canonicalReference)) {
        throw new Error('Another member has already been added with the same name and canonicalReference');
      }

      this[_members].push(member);
      this[_membersSorted] = false;
      this[_membersByCanonicalReference].set(member.canonicalReference, member);
    }

    public tryGetMember(canonicalReference: string): ApiItem | undefined {
      return this[_membersByCanonicalReference].get(canonicalReference);
    }

    /** @override */
    public serializeInto(jsonObject: Partial<IApiItemContainerMixinJson>): void {
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

export interface IApiItemContainer extends ApiItemContainerMixin, ApiItem {
}

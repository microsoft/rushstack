// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// tslint:disable-next-line:no-any
export type Constructor<T = {}> = new (...args: any[]) => T;
export type Mixin<TBase, TMixin> = TBase & Constructor<TMixin>;

// tslint:disable-next-line:interface-name
export interface ApiMembersMixin {
  readonly members: ReadonlyArray<ApiItem>;
  addMember(member: ApiItem): void;
}

const _members: unique symbol = Symbol('members');
const _membersSorted: unique symbol = Symbol('members');

export function ApiMembersMixin<TBaseClass extends Constructor>(baseClass: TBaseClass):
  Mixin<TBaseClass, ApiMembersMixin> {

  abstract class MixedClass extends baseClass implements ApiMembersMixin {
    public readonly [_members]: ApiItem[];
    public [_membersSorted]: boolean;

    // tslint:disable-next-line:no-any
    constructor(...args: any[]) {
      super(...args);
      this[_members] = [];
    }

    public addMember(member: ApiItem): void {
      this[_members].push(member);
      this[_membersSorted] = false;
    }

    public get members(): ReadonlyArray<ApiItem> {
      if (!this[_membersSorted]) {
        this[_members].sort((x, y) => x.getSortKey().localeCompare(y.getSortKey()));
        this[_membersSorted] = true;
      }

      return this[_members];
    }
  }

  return MixedClass;
}

export type ApiItemContainer = ApiItem & ApiMembersMixin;

import { ApiItem } from './ApiItem';

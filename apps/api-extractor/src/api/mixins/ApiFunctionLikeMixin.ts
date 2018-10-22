// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.s

import { Constructor, Mixin } from './Mixin';
import { ApiItem, SerializedApiItem, IApiItemOptions } from '../model/ApiItem';

// tslint:disable-next-line:interface-name
export interface ApiFunctionLikeMixin {
  readonly overloadIndex: number;
}

export interface IApiFunctionLike extends ApiFunctionLikeMixin, ApiItem {
}

export interface IApiFunctionLikeOptions {
  overloadIndex: number;
}

export function ApiFunctionLikeMixin<TBaseClass extends Constructor<ApiItem>>(baseClass: TBaseClass):
  Mixin<TBaseClass, ApiFunctionLikeMixin> {

  abstract class MixedClass extends baseClass implements ApiFunctionLikeMixin {
    public readonly overloadIndex: number;

    // tslint:disable-next-line:no-any
    constructor(...args: any[]) {
      super(...args);

      const options: IApiFunctionLikeOptions = args[0];
      this.overloadIndex = options.overloadIndex;
    }

    /** @override */
    public serializeInto(jsonObject: Partial<SerializedApiItem<IApiItemOptions
      & IApiFunctionLikeOptions>>): void {

      super.serializeInto(jsonObject);

      jsonObject.overloadIndex = this.overloadIndex;
    }
  }

  return MixedClass;
}

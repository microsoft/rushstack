// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.s

import { Constructor, Mixin } from './Mixin';
import { ApiItem, SerializedApiItem, IApiItemOptions } from '../model/ApiItem';

// tslint:disable-next-line:interface-name
export interface ApiStaticMixin {
  readonly isStatic: boolean;

  /** @override */
  serializeInto(jsonObject: Partial<SerializedApiItem<IApiItemOptions>>): void;
}

export interface IApiStatic extends ApiStaticMixin, ApiItem {
}

export interface IApiStaticMixinOptions {
  isStatic: boolean;
}

export function ApiStaticMixin<TBaseClass extends Constructor<ApiItem>>(baseClass: TBaseClass):
  Mixin<TBaseClass, ApiStaticMixin> {

  abstract class MixedClass extends baseClass implements ApiStaticMixin {
    public readonly isStatic: boolean;

    // tslint:disable-next-line:no-any
    constructor(...args: any[]) {
      super(...args);

      const options: IApiStaticMixinOptions = args[0];
      this.isStatic = options.isStatic;
    }

    /** @override */
    public serializeInto(jsonObject: Partial<SerializedApiItem<IApiItemOptions & IApiStaticMixinOptions>>): void {
      super.serializeInto(jsonObject);

      jsonObject.isStatic = this.isStatic;
    }
  }

  return MixedClass;
}

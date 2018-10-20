// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.s

import { Constructor, Mixin } from './Mixin';

// tslint:disable-next-line:interface-name
export interface ApiStaticMixin {
  readonly isStatic: boolean;
}

export interface IApiStatic extends ApiStaticMixin, ApiItem {
}

export interface IApiStaticMixinParameters {
  isStatic: boolean;
}

export function ApiStaticMixin<TBaseClass extends Constructor<ApiItem>>(baseClass: TBaseClass):
  Mixin<TBaseClass, ApiStaticMixin> {

  abstract class MixedClass extends baseClass implements ApiStaticMixin {
    public readonly isStatic: boolean;

    // tslint:disable-next-line:no-any
    constructor(...args: any[]) {
      super(...args);

      const parameters: IApiStaticMixinParameters = args[0];
      this.isStatic = parameters.isStatic;
    }

    /** @override */
    public serializeInto(jsonObject: Partial<SerializedApiItem<IApiItemParameters & IApiStaticMixinParameters>>): void {
      super.serializeInto(jsonObject);

      jsonObject.isStatic = this.isStatic;
    }
  }

  return MixedClass;
}

// Circular import
import { ApiItem, SerializedApiItem, IApiItemParameters } from '../model/ApiItem';

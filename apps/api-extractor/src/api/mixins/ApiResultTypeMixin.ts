// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.s

import { ApiItem, IApiItemJson, IApiItemConstructor, IApiItemOptions } from '../model/ApiItem';

/** @public */
export interface IApiResultTypeMixinOptions extends IApiItemOptions {
  resultTypeSignature: string;
}

export interface IApiResultTypeJson extends IApiItemJson {
  resultTypeSignature: string;
}

const _resultTypeSignature: unique symbol = Symbol('ApiResultTypeMixin._resultTypeSignature');

/** @public */
// tslint:disable-next-line:interface-name
export interface ApiResultTypeMixin extends ApiItem {
  readonly resultTypeSignature: string;
  serializeInto(jsonObject: Partial<IApiItemJson>): void;
}

/** @public */
export function ApiResultTypeMixin<TBaseClass extends IApiItemConstructor>(baseClass: TBaseClass):
  TBaseClass & (new (...args: any[]) => ApiResultTypeMixin) { // tslint:disable-line:no-any

  abstract class MixedClass extends baseClass implements ApiResultTypeMixin {
    public readonly [_resultTypeSignature]: string;

    /** @override */
    public static onDeserializeInto(options: Partial<IApiResultTypeMixinOptions>,
      jsonObject: IApiResultTypeJson): void {

      baseClass.onDeserializeInto(options, jsonObject);

      options.resultTypeSignature = jsonObject.resultTypeSignature;
    }

    // tslint:disable-next-line:no-any
    constructor(...args: any[]) {
      super(...args);

      const options: IApiResultTypeMixinOptions = args[0];
      this[_resultTypeSignature] = options.resultTypeSignature;
    }

    public get resultTypeSignature(): string {
      return this[_resultTypeSignature];
    }

    /** @override */
    public serializeInto(jsonObject: Partial<IApiResultTypeJson>): void {
      super.serializeInto(jsonObject);

      jsonObject.resultTypeSignature = this.resultTypeSignature;
    }
  }

  return MixedClass;
}

/** @public */
export namespace ApiResultTypeMixin {
  export function isBaseClassOf(apiItem: ApiItem): apiItem is ApiResultTypeMixin {
    return apiItem.hasOwnProperty(_resultTypeSignature);
  }
}

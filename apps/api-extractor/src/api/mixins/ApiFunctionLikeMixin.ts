// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.s

import { Mixin } from './Mixin';
import { ApiItem, IApiItemJson, IApiItemConstructor, IApiItemOptions } from '../model/ApiItem';
import { ApiParameter } from '../model/ApiParameter';

export interface IApiFunctionLikeMixinOptions extends IApiItemOptions {
  overloadIndex: number;
  parameters?: ApiParameter[];
}

export interface IApiFunctionLikeJson extends IApiItemJson {
  overloadIndex: number;
  parameters: IApiItemJson[];
}

const _overloadIndex: unique symbol = Symbol('_overloadIndex');
const _parameters: unique symbol = Symbol('_parameters');

// tslint:disable-next-line:interface-name
export interface ApiFunctionLikeMixin {
  readonly overloadIndex: number;
  readonly parameters: ReadonlyArray<ApiParameter>;
  addParameter(parameter: ApiParameter): void;
  serializeInto(jsonObject: Partial<IApiItemJson>): void;
}

export function ApiFunctionLikeMixin<TBaseClass extends IApiItemConstructor>(baseClass: TBaseClass):
  Mixin<TBaseClass, ApiFunctionLikeMixin> {

  abstract class MixedClass extends baseClass implements ApiFunctionLikeMixin {
    public readonly [_overloadIndex]: number;
    public readonly [_parameters]: ApiParameter[];

    /** @override */
    public static onDeserializeInto(options: Partial<IApiFunctionLikeMixinOptions>,
      jsonObject: IApiFunctionLikeJson): void {

      baseClass.onDeserializeInto(options, jsonObject);

      options.overloadIndex = jsonObject.overloadIndex;
      options.parameters = [];

      for (const parameterObject of jsonObject.parameters) {
        options.parameters.push(ApiItem.deserialize(parameterObject) as ApiParameter);
      }
    }

    // tslint:disable-next-line:no-any
    constructor(...args: any[]) {
      super(...args);

      const options: IApiFunctionLikeMixinOptions = args[0];
      this[_overloadIndex] = options.overloadIndex;

      this[_parameters] = options.parameters || [];
    }

    public get overloadIndex(): number {
      return this[_overloadIndex];
    }

    public get parameters(): ReadonlyArray<ApiParameter> {
      return this[_parameters];
    }

    public addParameter(parameter: ApiParameter): void {
      this[_parameters].push(parameter);
    }

    /** @override */
    public serializeInto(jsonObject: Partial<IApiFunctionLikeJson>): void {
      super.serializeInto(jsonObject);

      jsonObject.overloadIndex = this.overloadIndex;

      const parameterObjects: IApiItemJson[] = [];
      for (const parameter of this.parameters) {
        const parameterJsonObject: Partial<IApiItemJson> = {};
        parameter.serializeInto(parameterJsonObject);
        parameterObjects.push(parameterJsonObject as IApiItemJson);
      }

      jsonObject.parameters = parameterObjects;
    }
  }

  return MixedClass;
}

export interface IApiFunctionLike extends ApiFunctionLikeMixin, ApiItem {
}

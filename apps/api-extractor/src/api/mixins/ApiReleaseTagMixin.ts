// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.s

import { ApiItem, IApiItemJson, IApiItemConstructor, IApiItemOptions } from '../model/ApiItem';
import { ReleaseTag } from '../../aedoc/ReleaseTag';

/** @public */
export interface IApiReleaseTagMixinOptions extends IApiItemOptions {
  releaseTag: ReleaseTag;
}

export interface IApiReleaseTagMixinJson extends IApiItemJson {
  releaseTag: string;
}

const _releaseTag: unique symbol = Symbol('ApiReleaseTagMixin._releaseTag');

/** @public */
// tslint:disable-next-line:interface-name
export interface ApiReleaseTagMixin extends ApiItem {
  readonly releaseTag: ReleaseTag;

  /** @override */
  serializeInto(jsonObject: Partial<IApiItemJson>): void;
}

/** @public */
export function ApiReleaseTagMixin<TBaseClass extends IApiItemConstructor>(baseClass: TBaseClass):
  TBaseClass & (new (...args: any[]) => ApiReleaseTagMixin) { // tslint:disable-line:no-any

  abstract class MixedClass extends baseClass implements ApiReleaseTagMixin {
    public [_releaseTag]: ReleaseTag;

    /** @override */
    public static onDeserializeInto(options: Partial<IApiReleaseTagMixinOptions>,
      jsonObject: IApiReleaseTagMixinJson): void {

      baseClass.onDeserializeInto(options, jsonObject);

      const deserializedReleaseTag: ReleaseTag | undefined = ReleaseTag[jsonObject.releaseTag];
      if (deserializedReleaseTag === undefined) {
        throw new Error(`Failed to deserialize release tag for ${JSON.stringify(jsonObject.name)}`);
      }

      options.releaseTag = deserializedReleaseTag;
    }

    // tslint:disable-next-line:no-any
    constructor(...args: any[]) {
      super(...args);

      const options: IApiReleaseTagMixinOptions = args[0];
      this[_releaseTag] = options.releaseTag;
    }

    public get releaseTag(): ReleaseTag {
      return this[_releaseTag];
    }

    /** @override */
    public serializeInto(jsonObject: Partial<IApiReleaseTagMixinJson>): void {
      super.serializeInto(jsonObject);

      jsonObject.releaseTag = ReleaseTag[this.releaseTag];
    }
  }

  return MixedClass;
}

/** @public */
export namespace ApiReleaseTagMixin {
  export function isBaseClassOf(apiItem: ApiItem): apiItem is ApiReleaseTagMixin {
    return apiItem.hasOwnProperty(_releaseTag);
  }
}

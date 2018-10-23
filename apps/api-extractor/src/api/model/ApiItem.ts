// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Constructor, PropertiesOf } from '../mixins/Mixin';

export const enum ApiItemKind {
  Class = 'Class',
  EntryPoint = 'EntryPoint',
  Interface = 'Interface',
  Method = 'Method',
  Model = 'Model',
  Namespace = 'Namespace',
  Package = 'Package',
  PropertySignature = 'PropertySignature',
  None = 'None'
}

export interface IApiItemOptions {
  name: string;
}

export interface IApiItemJson {
  name: string;
  kind: ApiItemKind;
  canonicalReference: string;
}

export class ApiItem {
  private readonly _name: string;

  public static deserialize(jsonObject: IApiItemJson): ApiItem {
    // tslint:disable-next-line:no-use-before-declare
    return Deserializer.deserialize(jsonObject);
  }

  /** @virtual */
  public static onDeserializeInto(options: Partial<IApiItemOptions>, jsonObject: IApiItemJson): void {
    options.name = jsonObject.name;
  }

  public constructor(options: IApiItemOptions) {
    this._name = options.name;
  }

  /** @virtual */
  public serializeInto(jsonObject: Partial<IApiItemJson>): void {
    jsonObject.kind = this.kind;
    jsonObject.name = this.name;
    jsonObject.canonicalReference = this.canonicalReference;
  }

  /** @virtual */
  public get kind(): ApiItemKind {
    throw new Error('ApiItem.kind was not implemented by the child class');
  }

  public get name(): string {
    return this._name;
  }

  /** @virtual */
  public get canonicalReference(): string {
    throw new Error('ApiItem.kind was not implemented by the child class');
  }

  /** @virtual */
  public get members(): ReadonlyArray<ApiItem> {
    return [];
  }

  /** @virtual */
  public getSortKey(): string {
    return this.canonicalReference;
  }
}

// For mixins
export interface IApiItemConstructor extends Constructor<ApiItem>, PropertiesOf<typeof ApiItem> { }

// Circular import
import { Deserializer } from './Deserializer';

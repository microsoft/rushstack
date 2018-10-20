// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as tsdoc from '@microsoft/tsdoc';

export const enum ApiItemKind {
  Class = 'Class',
  EntryPoint = 'EntryPoint',
  Method = 'Method',
  Model = 'Model',
  Namespace = 'Namespace',
  Package = 'Package',
  Parameter = 'Parameter',
  None = 'None'
}

export interface IApiItemParameters {
  name: string;
}

export interface ISerializedMetadata {
  kind: ApiItemKind;
  members: ReadonlyArray<SerializedApiItem<IApiItemParameters>>;
}

export type SerializedApiItem<T extends IApiItemParameters> = T & ISerializedMetadata;

export class ApiItem {
  private readonly _name: string;

  public static deserialize(jsonObject: SerializedApiItem<IApiItemParameters>): ApiItem {
    // tslint:disable-next-line:no-use-before-declare
    return Deserializer.deserialize(jsonObject);
  }

  public constructor(parameters: IApiItemParameters) {
    this._name = parameters.name;
  }

  /** @virtual */
  public serializeInto(jsonObject: Partial<SerializedApiItem<IApiItemParameters>>): void {
    jsonObject.kind = this.kind;
    jsonObject.name = this.name;
  }

  /** @virtual */
  public get kind(): ApiItemKind {
    throw new Error('ApiItem.kind was not implemented by the child class');
  }

  public get name(): string {
    return this._name;
  }

  /** @virtual */
  public get canonicalSelector(): string {
    throw new Error('ApiItem.kind was not implemented by the child class');
  }

  /** @virtual */
  public get members(): ReadonlyArray<ApiItem> {
    return [];
  }

  /** @virtual */
  public getSortKey(): string {
    return `${this.name}:${this.canonicalSelector}`;
  }
}

// Circular import
import { Deserializer } from './Deserializer';

// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Deserializer } from './Deserializer';

export const enum ApiItemKind {
  Class = 'Class',
  EntryPoint = 'EntryPoint',
  Method = 'Method',
  Model = 'Model',
  Namespace = 'Namespace',
  Package = 'Package',
  Parameter = 'Parameter'
}

export interface IApiItemParameters {
  name: string;
}

export interface ISerializedMetadata {
  kind: ApiItemKind;
  members: ReadonlyArray<SerializedApiItem<IApiItemParameters>>;
}

export type SerializedApiItem<T extends IApiItemParameters> = T & ISerializedMetadata;

export abstract class ApiItem {
  public abstract readonly kind: ApiItemKind;

  private _members: ApiItem[];
  private _name: string;
  private _membersSorted: boolean;

  public static deserialize(jsonObject: SerializedApiItem<IApiItemParameters>): ApiItem {
    return Deserializer.deserialize(jsonObject);
  }

  public constructor(parameters: IApiItemParameters) {
    this._name = parameters.name;
  }

  public serializeInto(jsonObject: Partial<SerializedApiItem<IApiItemParameters>>): void {
    jsonObject.kind = this.kind;
    jsonObject.name = this.name;
    const memberObjects: Partial<SerializedApiItem<IApiItemParameters>>[] = [];

    for (const member of this.members) {
      const memberJsonObject: Partial<SerializedApiItem<IApiItemParameters>> = {};
      member.serializeInto(memberJsonObject);
      memberObjects.push(memberJsonObject);
    }

    jsonObject.members = memberObjects as SerializedApiItem<IApiItemParameters>[];
  }

  public get name(): string {
    return this._name;
  }

  public addMember(member: ApiItem): void {
    this._members.push(member);
    this._membersSorted = false;
  }

  public get members(): ReadonlyArray<ApiItem> {
    if (!this._membersSorted) {
      this._members.sort((x, y) => x.getSortKey().localeCompare(y.getSortKey()));
      this._membersSorted = true;
    }

    return this._members;
  }

  protected abstract getSortKey(): string;
}

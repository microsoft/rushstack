// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const LABEL: unique symbol = Symbol('loc-plugin-marked');

export class EntityMarker {
  public static markEntity<TModule, TValue>(module: TModule, value: TValue): void {
    module[LABEL] = value;
  }

  public static getMark<TModule, TValue>(module: TModule): TValue {
    return module[LABEL];
  }
}

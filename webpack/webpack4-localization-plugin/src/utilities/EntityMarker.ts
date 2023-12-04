// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const LABEL: unique symbol = Symbol('loc-plugin-marked');

export interface IMarkable {
  [LABEL]: boolean;
}

/**
 * Use the functions on this class to mark webpack entities that contain localized resources.
 */
export class EntityMarker {
  public static markEntity<TModule>(module: TModule, value: boolean): void {
    (module as unknown as IMarkable)[LABEL] = value;
  }

  public static getMark<TModule>(module: TModule): boolean | undefined {
    return (module as unknown as IMarkable)[LABEL];
  }
}

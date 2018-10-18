// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// tslint:disable-next-line:no-any
export type Constructor<T = {}> = new (...args: any[]) => T;

export type PropertiesOf<T> = { [K in keyof T]: T[K] };

export type Mixin<TBase, TMixin> = TBase & Constructor<TMixin>;

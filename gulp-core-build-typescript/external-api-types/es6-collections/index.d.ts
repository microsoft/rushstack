
// Type definitions for es6-collections v0.5.1
// Project: https://github.com/WebReflection/es6-collections/
// Definitions by: Ron Buckton <http://github.com/rbuckton>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

/* *****************************************************************************
Copyright (c) Microsoft Corporation. All rights reserved.
Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at http://www.apache.org/licenses/LICENSE-2.0

THIS CODE IS PROVIDED *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
MERCHANTABLITY OR NON-INFRINGEMENT.

See the Apache Version 2.0 License for specific language governing permissions
and limitations under the License.
***************************************************************************** */

/* tslint:disable: interface-name */
/* tslint:disable: no-any */
/* tslint:disable: no-shadowed-variable */
/* tslint:disable: no-var-keyword */
/* tslint:disable: variable-name */
/* tslint:disable: member-ordering */
/* tslint:disable: no-unused-variable */
/* tslint:disable: quotemark */
/* tslint:disable: indent */
/* tslint:disable: max-line-length */
/* tslint:disable: member-access */
/* tslint:disable: whitespace */

export interface IteratorResult<T> {
    done: boolean;
    value?: T;
}

export interface Iterator<T> {
    next(value?: any): IteratorResult<T>;
    return?(value?: any): IteratorResult<T>;
    throw?(e?: any): IteratorResult<T>;
}

export interface ForEachable<T> {
    forEach(callbackfn: (value: T) => void): void;
}

export interface Map<K, V> {
    clear(): void;
    delete(key: K): boolean;
    forEach(callbackfn: (value: V, index: K, map: Map<K, V>) => void, thisArg?: any): void;
    get(key: K): V;
    has(key: K): boolean;
    set(key: K, value?: V): Map<K, V>;
    entries(): Iterator<[K, V]>;
    keys(): Iterator<K>;
    values(): Iterator<V>;
    size: number;
}

export interface MapConstructor {
    new <K, V>(): Map<K, V>;
    new <K, V>(iterable: ForEachable<[K, V]>): Map<K, V>;
    prototype: Map<any, any>;
}

// declare var Map: MapConstructor;

export interface Set<T> {
    add(value: T): Set<T>;
    clear(): void;
    delete(value: T): boolean;
    forEach(callbackfn: (value: T, index: T, set: Set<T>) => void, thisArg?: any): void;
    has(value: T): boolean;
    entries(): Iterator<[T, T]>;
    keys(): Iterator<T>;
    values(): Iterator<T>;
    size: number;
}

export interface SetConstructor {
    new <T>(): Set<T>;
    new <T>(iterable: ForEachable<T>): Set<T>;
    prototype: Set<any>;
}

// declare var Set: SetConstructor;

export interface WeakMap <K, V> {
    delete(key: K): boolean;
	clear(): void;
    get(key: K): V;
    has(key: K): boolean;
    set(key: K, value?: V): WeakMap<K, V>;
}

export interface WeakMapConstructor {
    new <K, V>(): WeakMap<K, V>;
    new <K, V>(iterable: ForEachable<[K, V]>): WeakMap<K, V>;
    prototype: WeakMap<any, any>;
}

// declare var WeakMap: WeakMapConstructor;

export interface WeakSet <T> {
    delete(value: T): boolean;
	clear(): void;
    add(value: T): WeakSet<T>;
    has(value: T): boolean;
}

export interface WeakSetConstructor {
    new <T>(): WeakSet<T>;
    new <T>(iterable: ForEachable<T>): WeakSet<T>;
    prototype: WeakSet<any>;
}

// declare var WeakSet: WeakSetConstructor;

// declare module "es6-collections" {
//     var Map: MapConstructor;
//     var Set: SetConstructor;
//     var WeakMap: WeakMapConstructor;
//     var WeakSet: WeakSetConstructor;
// }

// Typings based on DefinitelyTyped definitions from es6-collections@0.5.1

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

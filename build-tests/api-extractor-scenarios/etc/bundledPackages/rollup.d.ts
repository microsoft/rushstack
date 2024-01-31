import { Lib3Class } from 'api-extractor-lib3-test/lib/index';

/** @public */
export declare function f(arg1: Lib1Class, arg2: Lib2Class, arg3: Lib3Class, arg4: Lib4Enum): void;

/** @public */
export declare class Lib1Class extends Lib1ForgottenExport {
    readonly readonlyProperty: string;
    writeableProperty: string;
}

declare class Lib1ForgottenExport {
}

/** @public */
export declare class Lib2Class {
    prop: number;
}

export { Lib3Class }

/** @public */
export declare enum Lib4Enum {
    Foo = "Foo",
    Bar = "Bar",
    Baz = "Baz"
}

/** @public */
export declare function lib5Function(): number;

export { }

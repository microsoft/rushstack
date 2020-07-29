import * as Lib1 from 'api-extractor-lib1-test';
import { Lib1Class } from 'api-extractor-lib3-test';
import { Lib1Interface } from 'api-extractor-lib1-test';
import { Lib2Class } from 'api-extractor-lib2-test';
import { Lib2Interface } from 'api-extractor-lib2-test';

/** @public */
export declare class Item {
    options: Options;
    lib1: Lib1Interface;
    lib2: Lib2Interface;
    lib3: Lib1Class;
    reExport: Lib2Class;
}
export { Lib1 }
export { Lib2Interface }

declare interface Options {
    name: string;
    color: 'red' | 'blue';
}

export { }

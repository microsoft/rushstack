import * as apiExtractorLib3Test from 'api-extractor-lib3-test';
import * as Lib1 from 'api-extractor-lib1-test';
import type { Lib1Class } from 'api-extractor-lib3-test';
import type { Lib1Interface } from 'api-extractor-lib1-test';
import { Lib2Class } from 'api-extractor-lib2-test';
import { Lib2Interface } from 'api-extractor-lib2-test';
import { Lib3Class } from 'api-extractor-lib3-test';

/** @public */
export declare class Item {
    options: Options;
    lib1: Lib1Interface;
    lib2: Lib2Interface;
    lib3: Lib1Class;
    externalModule: typeof apiExtractorLib3Test;
    typeofImportLocal: typeof OptionsClass;
    typeofImportExternal: typeof Lib1Class;
    reExportLocal: Lib2Class;
    reExportExternal: Lib3Class;
}

export { Lib1 }

export { Lib2Interface }

declare interface Options {
    name: string;
    color: 'red' | 'blue';
}

declare class OptionsClass {
}

export { }

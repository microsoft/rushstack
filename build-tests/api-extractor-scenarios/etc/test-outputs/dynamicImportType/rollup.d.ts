import { apiExtractorLib1Test } from 'api-extractor-lib1-test';
import { apiExtractorLib2Test } from 'api-extractor-lib2-test';
import { apiExtractorLib3Test } from 'api-extractor-lib3-test';
import * as Lib1 from 'api-extractor-lib1-test';
import { Lib2Class } from 'api-extractor-lib2-test';
import { Lib2Interface } from 'api-extractor-lib2-test';

/** @public */
export declare class Item {
    options: Options;
    lib1: apiExtractorLib1Test;
    lib2: apiExtractorLib2Test;
    lib3: apiExtractorLib3Test;
    reExport: Lib2Class;
}
export { Lib1 }
export { Lib2Interface }

declare interface Options {
    name: string;
    color: 'red' | 'blue';
}

export { }

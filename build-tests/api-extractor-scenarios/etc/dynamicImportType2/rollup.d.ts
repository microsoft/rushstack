import { Lib1Namespace } from 'api-extractor-lib1-test';

/** @public */
export declare interface IExample {
    predefinedNamedImport: Lib1Namespace.Inner.X;
    dottedImportType: Lib1Namespace | undefined;
    dottedImportType2: Lib1Namespace | undefined;
    localDottedImportType: LocalClass;
    localDottedImportType2: import('./namespace-export').LocalNS.LocalNSClass;
}

declare class LocalClass {
}

export { }

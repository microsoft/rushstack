import { Lib1Namespace } from 'api-extractor-lib1-test';

/** @public */
export declare interface IExample {
    predefinedNamedImport: Lib1Namespace.Inner.X;
    dottedImportType: Lib1Namespace.Inner.X | undefined;
    dottedImportType2: Lib1Namespace.Y | undefined;
    localDottedImportType: LocalModule.LocalClass;
    localDottedImportType2: LocalNS.LocalNSClass;
}

declare class LocalClass_2 {
}

declare interface LocalInterface {
}

declare namespace LocalModule {
    export {
        LocalClass_2 as LocalClass,
        LocalInterface
    }
}

declare namespace LocalNS {
    class LocalNSClass {
    }
    interface LocalNSInterface {
    }
}

export { }

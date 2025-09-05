/** @public */
export declare namespace AllExportedNS {
    class ExportedClass {
    }
    interface ExportedInterface {
    }
}

/** @public */
export declare class FinalRenamedClass {
}

/** @public */
export declare namespace PartalExportedNS {
    export const var1 = 1, var2 = 2;
    interface UnexportedClass {
    }
    export interface ExportedInterface {
        prop: UnexportedClass;
    }
    export {};
}

/** @public */
export declare namespace ReexportNS {
    export { FinalRenamedClass as RenamedClass };
    export { FinalRenamedClass as RenamedClass3 };
}

export { }

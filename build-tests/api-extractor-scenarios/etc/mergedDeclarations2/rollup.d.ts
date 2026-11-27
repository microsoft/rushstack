/** @public */
export declare namespace ExportedInterfaceAndLocalNamespace {
    export interface Item {
        id: string;
    }
}

/** @public */
export declare interface ExportedInterfaceAndLocalNamespace {
    getItems(): ExportedInterfaceAndLocalNamespace.Item[];
}

/** @public */
export declare interface LocalInterfaceAndExportedNamespace {
    size: number;
}

/** @public */
export declare namespace LocalInterfaceAndExportedNamespace {
    export function create(): LocalInterfaceAndExportedNamespace;
}

export { }

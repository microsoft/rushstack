/** @public */
export namespace PartalExportedNS {
  export const var1 = 1,
    var2 = 2;
  interface UnexportedClass {}
  export interface ExportedInterface {
    prop: UnexportedClass;
  }
}

/** @public */
export namespace AllExportedNS {
  export class ExportedClass {}
  export interface ExportedInterface {}
}

/** @public */
export declare namespace ReexportNS {
  export { RenamedClass };
  export { RenamedClass as RenamedClass3 };
}

/** @public */
class RenamedClass {}

export { RenamedClass as FinalRenamedClass };

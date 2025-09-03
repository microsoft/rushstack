export namespace PartalExportedNS {
  export const var1 = 1,
    var2 = 2;
  interface UnexportedClass {}
  export interface ExportedInterface {
    prop: UnexportedClass;
  }
}

export namespace AllExportedNS {
  export class ExportedClass {}
  export interface ExportedInterface {}
}

export declare namespace ReexportNS {
  export { RenamedClass };
  export { RenamedClass as RenamedClass3 };
}

class RenamedClass {}

export { RenamedClass as FinalRenamedClass };

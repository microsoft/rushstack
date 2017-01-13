// Type definitions for z-schema v3.16.1
// Project: https://github.com/zaggino/z-schema
// Definitions by: Pete Gonzalez del Solar

declare module ZSchema {

  export interface Options {
    assumeAdditional?: boolean;
    asyncTimeout?: number;
    breakOnFirstError?: boolean;
    forceAdditional?: boolean;
    forceItems?: boolean;
    forceMaxItems?: boolean;
    forceMaxLength?: boolean;
    forceMinItems?: boolean;
    forceMinLength?: boolean;
    forceProperties?: boolean;
    ignoreUnknownFormats?: boolean;
    ignoreUnresolvableReferences?: boolean;
    noEmptyArrays?: boolean;
    noEmptyStrings?: boolean;
    noExtraKeywords?: boolean;
    noTypeless?: boolean;
    pedanticCheck?: boolean;
    reportPathAsArray?: boolean;
    strictMode?: boolean;
    strictUris?: boolean;
  }

  export interface Error {
    // Ex. "z-schema validation error"
    name: string;

    // Ex. "JSON_OBJECT_VALIDATION_FAILED"
    message: string;

    details: Array<ErrorDetail>;
  }

  export interface ErrorDetail {
    // Ex. "INVALID_TYPE"
    code: string;
    // Ex. "Expected type string but found type array"
    message: string;
    // Ex. ["string","array"]
    params: Array<string>;
    // Ex. "#/projects/1"
    path: string;

    inner?: ErrorDetail[];
  }

  export class Validator {
    constructor(options: Options);

    /**
     * @param json - either a JSON string or a parsed JSON object
     * @param schema - the JSON object representing the schema
     * @returns true if json matches schema
     */
    validate(json: any, schema: any): boolean;

    /**
     * @param json - either a JSON string or a parsed JSON object
     * @param schema - the JSON object representing the schema
     */
    validate(json: any, schema: any, callback: (err: any, valid: boolean) => void): void;

    getLastError(): Error;
    getLastErrors(): Array<ErrorDetail>;
  }
}

declare module "z-schema" {
  export = ZSchema.Validator;
}


/**
 * A simple, normal definition
 * @public
 */
declare interface ISimpleInterface {
}

/**
 * Example of a class that inherits from an externally imported class.
 * @public
 */
export declare class SubclassWithImport extends RenamedReexportedClass implements ISimpleInterface {
    test(): void;
}

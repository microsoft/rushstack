/**
 * Convert line endings to `\r\n`
 * @public
 */
declare function convertToCrLf(input: string): string;

/**
 * Convert line endings to `\n`
 * @public
 */
declare function convertToLf(input: string): string;

/**
* @module
* Functions for manipulating text.
*/
export declare namespace Text {
    export {
        convertToLf,
        convertToCrLf
    }
}

export { }

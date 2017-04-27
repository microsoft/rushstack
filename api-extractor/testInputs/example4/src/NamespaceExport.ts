import MyClass from './MyClass';

/**
 * This is a test for the namespace API type. It should be supported 
 * and appear in the *api.ts file.
 * 
 * @public
 */
export namespace NamespaceExport {
  export const aadLogo: string = '\uED68';
  export const accept: string = '\uE8FB';
  export const accessLogo: string = '\uED69';
  export const accounts: string = '\uE910';

  /**
   * Testing a structured type in a namespace.
   */
  export class RealNumber {
    /**
     * Testing a private property, this should
     * not appear in the JSON nor *api.ts file.
     */
    private _value: number; 

    /**
     * Testing a public property.
     */
    public isReal: boolean;
    
    /**
     * Testing a getter.
     */
    public get getNumber(): number {
      return this._value;
    }

    /**
     * Testing a setter.
     */
    public set setNumber(value: number) {
      this._value = value;
    }

    /**
     * Testing a method.
     */
    public squared(): number {
      return this._value * 2;
    }
  }

  /**
   * This is a test for interfaces in a namespace. 
   */
  export interface Number {
    real: RealNumber;
  }

  /**
   * This is a test for a function in a namespace.
   * @param value - this is a description for the param. 
   */
  export function aFunction(value: number): void {
  }
}
 
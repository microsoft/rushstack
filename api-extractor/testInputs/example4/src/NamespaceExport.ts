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

  export class RealNumber {
    private _value: number; 

    public isReal: boolean;
    
    public get getNumber(): number {
      return this._value;
    }

    public set setNumber(value: number) {
      this._value = value;
    }

    public squared(): number {
      return this._value * 2;
    }
  }

  export interface Number {
    real: RealNumber;
  }

}
 
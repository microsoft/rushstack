import OtherName from './folder/AliasClass2';

export { default as MyClass, InternalClass, PreapprovedInternalClass } from './folder/MyClass';
export { AliasClass3 as AliasClass4 } from './folder/AliasClass3';

function privateFunction(): number {
  return 123;
}

export function publicFunction(param: number): string {
  return 'hi' + param;
}

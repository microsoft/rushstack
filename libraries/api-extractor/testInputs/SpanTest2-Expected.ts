import OtherName from './folder/AliasClass2';

export {
  default as MyClass, InternalClass as _InternalClass,
  PreapprovedInternalClass as _PreapprovedInternalClass,
  __proto__,
  hasOwnProperty,
  A
} from './folder/MyClass';

export { AliasClass3 as AliasClass4 } from './folder/AliasClass3';

function privateFunction(): number;

export function publicFunction(param: number): string;

export { AlphaTaggedClass, BetaTaggedClass, PublicTaggedClass } from './folder/ReleaseTagTests';

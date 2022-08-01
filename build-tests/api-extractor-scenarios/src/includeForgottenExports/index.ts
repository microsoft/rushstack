import * as internal2 from './internal2';

/** This doc comment should be inherited by `ForgottenExport2` */
class ForgottenExport1 {
  prop?: ForgottenExport2;
  constructor() {}
}

/** {@inheritDoc ForgottenExport1} */
type ForgottenExport2 = number;

/** @public */
export function someFunction1(): ForgottenExport1 {
  return new ForgottenExport1();
}

/**
 * This type is exported but has the same name as an unexported type in './internal.ts'. This
 * unexported type is also included in the API report and doc model files. The unexported type
 * will be renamed to avoid a name conflict.
 * @public
 */
export type DuplicateName = boolean;

export { someFunction2 } from './internal1';

/** @public */
export namespace SomeNamespace1 {
  class ForgottenExport3 {}

  export function someFunction3(): ForgottenExport3 {
    return new ForgottenExport3();
  }
}

namespace ForgottenExport4 {
  export class ForgottenExport5 {}
}

/** @public */
export function someFunction4(): ForgottenExport4.ForgottenExport5 {
  return new ForgottenExport4.ForgottenExport5();
}

/** @public */
export function someFunction5(): internal2.ForgottenExport6 {
  return new internal2.ForgottenExport6();
}

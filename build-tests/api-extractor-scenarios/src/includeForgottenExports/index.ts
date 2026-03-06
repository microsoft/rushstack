import * as internal2 from './internal2.ts';

/**
 * `ForgottenExport2` wants to inherit this doc comment, but unfortunately this isn't
 * supported yet
 * @public
 */
class ForgottenExport1 {
  prop?: ForgottenExport2;
  constructor() {}
}

/**
 * @public
 * {@inheritDoc ForgottenExport1}
 */
type ForgottenExport2 = number;

/** @public */
export function someFunction1(): ForgottenExport1 {
  return new ForgottenExport1();
}

/**
 * This type is exported but has the same name as a forgotten type in './internal.ts'. This
 * forgotten type is also included in the API report and doc model files. The forgotten type
 * will be renamed to avoid a name conflict.
 * @public
 */
export type DuplicateName = boolean;

export { someFunction2 } from './internal1.ts';

/** @public */
export namespace SomeNamespace1 {
  class ForgottenExport3 {}

  export function someFunction3(): ForgottenExport3 {
    return new ForgottenExport3();
  }
}

/** @public */
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

/**
 * This forgotten item has the same name as another forgotten item in another
 * file. They should be given unique names.
 * @public
 */
class AnotherDuplicateName {}

/** @public */
export function someFunction6(): AnotherDuplicateName {
  return new AnotherDuplicateName();
}

export { someFunction7 } from './internal1.ts';

/** This doc comment should be inherited by `AnotherForgottenExport` */
class ForgottenExport {
  prop?: AnotherForgottenExport;
  constructor() {}
}

/** {@inheritDoc ForgottenExport} */
type AnotherForgottenExport = number;

/** @public */
export function someFunction(): ForgottenExport {
  return new ForgottenExport();
}

/**
 * This type is exported but has the same name as an unexported type in './internal.ts'. This
 * unexported type is also included in the API report and doc model files. The unexported type
 * will be renamed to avoid a name conflict.
 * @public
 */
export type DuplicateName = boolean;

export { anotherFunction } from './internal';

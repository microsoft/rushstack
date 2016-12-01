// tslint:disable:no-any

/**
 * This decorator is applied to a class's member function or property.
 * It indicates that the definition may optionally be overridden in a
 * child class.  Conversely, if the \@virtual decorator is NOT applied to
 * a definition, then child classes may NOT override it.
 * This decorator is currently used for documentation purposes only.
 * In the future, it may be enforced at runtime.
 *
 * @public
 */
export function virtual(target: Object, propertyKey: string | symbol,
  descriptor: TypedPropertyDescriptor<any>): void {
  // Eventually we may implement runtime validation (e.g. in DEBUG builds)
  // but currently this decorator is only used by the build tools.
}

/**
 * This decorator is applied to a class (but NOT member function or property).
 * It indicates that subclasses must not inherit from this class.
 * This decorator is currently used for documentation purposes only.
 * In the future, it may be enforced at runtime.
 * @alpha
 */
function sealed(target: Function): void {
  // Eventually we may implement runtime validation (e.g. in DEBUG builds)
  // but currently this decorator is only used by the build tools.
}

// tslint:disable-next-line:export-name
export default sealed as ClassDecorator;

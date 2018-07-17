// @public
class DocClass1 {
  exampleFunction(a: string, b: string): string;
  interestingEdgeCases(): void;
  // WARNING: The @eventProperty tag requires the property to be readonly
  // @eventproperty
  malformedEvent: SystemEvent;
  // @eventproperty
  readonly modifiedEvent: SystemEvent;
  regularProperty: SystemEvent;
  tableExample(): void;
}

// @public
class SystemEvent {
  addHandler(handler: () => void): void;
}


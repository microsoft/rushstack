// @public
declare class DocBaseClass {
}

// @public
declare class DocClass1 extends DocBaseClass implements IDocInterface1, IDocInterface2 {
    // @deprecated (undocumented)
    deprecatedExample(): void;
    exampleFunction(a: string, b: string): string;
    exampleFunction(x: number): number;
    interestingEdgeCases(): void;
    // @eventproperty
    malformedEvent: SystemEvent;
    // @eventproperty
    readonly modifiedEvent: SystemEvent;
    regularProperty: SystemEvent;
    static sumWithExample(x: number, y: number): number;
    tableExample(): void;
}

// @public
declare enum DocEnum {
    One = 1,
    Two = 2,
    Zero = 0
}

// @public (undocumented)
interface IDocInterface1 {
    regularProperty: SystemEvent;
}

// @public (undocumented)
interface IDocInterface2 extends IDocInterface1 {
    // @deprecated (undocumented)
    deprecatedExample(): void;
}

// @public
declare class SystemEvent {
    addHandler(handler: () => void): void;
}


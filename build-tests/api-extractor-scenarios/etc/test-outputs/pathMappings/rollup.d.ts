/** @public */
export declare abstract class AbstractClass {
    public abstract member(): void;
}

/** @public */
export declare class SimpleClass {
    public member(): void {}

    public optionalParamMethod(x?: number): void {}

    public get readonlyProperty(): string {
        return 'hello';
    }

    public get writeableProperty(): string {
        return 'hello';
    }
    public set writeableProperty(value: string) {}
}

export { }

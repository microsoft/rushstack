/** @public */
export declare abstract class AbstractClass {
    public abstract member(): void;
}

/** @public */
export declare enum RegularEnum {
    /**
     * These are some docs for Zero
     */
    Zero,

    /**
     * These are some docs for One
     */
    One = 1,

    /**
     * These are some docs for Two
     */
    Two = RegularEnum.One + 1
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

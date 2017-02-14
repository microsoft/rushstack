/**
 * {@inheritdoc MyClass }
 */
export enum inheritLocalOptionOne {
}

/**
 * {@inheritdoc example3:MyClass }
 */
export enum inheritLocalOptionTwo {
}

/** 
 * {@inheritdoc MyClass.methodWithTwoParams }
 */
// (Error #1) methodWithTwoParams not a member of MyClass
export function inheritLocalOptionThreeFunction(): void {
}

/**
 * {@inheritdoc inheritLocalCircularDependencyTwo }
 */
// (Error #2) Circular reference
export enum inheritLocalCircularDependencyOne {
}

/**
 * {@inheritdoc inheritLocalCircularDependencyOne }
 */
export enum inheritLocalCircularDependencyTwo {
}

/**
 * {@inheritdoc es6-collections:ForEachable }
 */
export interface IJsonResolutionInterface {
}


/**
 * {@inheritdoc es6-collections:aFunction }
 */
export function jsonResolutionFunction(): boolean {
    return true;
}

/**
 * {@inheritdoc es6-collections:aClass }
 */
export class jsonResolutionClass {
    /**
     * {@inheritdoc es6-collections:ForEachable.aMethod }
     */
    public jsonResolutionMethod(): boolean {
        return true;
    }
}


/**
 * This is the summary for MyClass.
 */
export default class MyClass {

}
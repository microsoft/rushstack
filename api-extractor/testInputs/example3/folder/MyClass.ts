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
 * This is the summary for MyClass.
 */
export default class MyClass {

}
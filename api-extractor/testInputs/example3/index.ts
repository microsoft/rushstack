/**
 * This example folder is used to test the functionality of DocItemLoader and API reference resolution. 
 */
declare const packageDescription: void;

export {
    inheritLocalOptionOne,
    inheritLocalOptionTwo,
    inheritLocalOptionThreeFunction,
    inheritLocalCircularDependencyOne,
    inheritLocalCircularDependencyTwo,
    jsonResolutionFunction,
    jsonResolutionClass
} from './folder/MyClass';
export { default as MyClass } from './folder/MyClass';
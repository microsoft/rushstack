[Home](./index) &gt; [api-documenter-test](./api-documenter-test.md) &gt; [DocClass1](./api-documenter-test.docclass1.md) &gt; [sumWithExample](./api-documenter-test.docclass1.sumwithexample.md)

## DocClass1.sumWithExample() method

Returns the sum of two numbers.

<b>Signature:</b>

```typescript
static sumWithExample(x: number, y: number): number;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  x | <code>number</code> | the first number to add |
|  y | <code>number</code> | the second number to add |

<b>Returns:</b>

`number`

the sum of the two numbers

## Remarks

This illustrates usage of the `@example` block tag.

## Example 1

Here's a simple example:

```
// Prints "2":
console.log(DocClass1.sumWithExample(1,1));

```

## Example 2

Here's an example with negative numbers:

```
// Prints "0":
console.log(DocClass1.sumWithExample(1,-1));

```


[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [Sort](./node-core-library.sort.md) &gt; [compareByValue](./node-core-library.sort.comparebyvalue.md)

## Sort.compareByValue() method

Compares `x` and `y` using the JavaScript `>` and `<` operators. This function is suitable for usage as the callback for `array.sort()`<!-- -->.

<b>Signature:</b>

```typescript
static compareByValue(x: any, y: any): number;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>x</p> | <p>`any`</p> |  |
|  <p>y</p> | <p>`any`</p> |  |

<b>Returns:</b>

`number`

-1 if `x` is smaller than `y`<!-- -->, 1 if `x` is greater than `y`<!-- -->, or 0 if the values are equal.

## Remarks

The JavaScript ordering is generalized so that `undefined` &lt; `null` &lt; all other values.

## Example


```ts
let array: number[] = [3, 6, 2];
array.sort(Sort.compareByValue);  // [2, 3, 6]

```


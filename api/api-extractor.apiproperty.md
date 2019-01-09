[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiProperty](./api-extractor.apiproperty.md)

## ApiProperty class

Represents a TypeScript property declaration that belongs to an `ApiClass`<!-- -->.

<b>Signature:</b>

```typescript
export declare class ApiProperty extends ApiProperty_base 
```

## Properties

|  <p>Property</p> | <p>Modifiers</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- | --- |
|  <p>[canonicalReference](./api-extractor.apiproperty.canonicalreference.md)</p> |  | <p>`string`</p> | <p></p> |
|  <p>[kind](./api-extractor.apiproperty.kind.md)</p> |  | <p>`ApiItemKind`</p> | <p></p> |

## Methods

|  <p>Method</p> | <p>Modifiers</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[getCanonicalReference(name, isStatic)](./api-extractor.apiproperty.getcanonicalreference.md)</p> | <p>`static`</p> |  |

## Remarks

This is part of the [ApiModel](./api-extractor.apimodel.md) hierarchy of classes, which are serializable representations of API declarations.

`ApiProperty` represents a TypeScript declaration such as the `width` and `height` members in this example:

```ts
export class Widget {
  public width: number = 100;

  public get height(): number {
    if (this.isSquashed()) {
      return 0;
    } else {
      return this.clientArea.height;
    }
  }
}

```
Note that member variables are also considered to be properties.

If the property has both a getter function and setter function, they will be represented by a single `ApiProperty` and must have a single documentation comment.

Compare with [ApiPropertySignature](./api-extractor.apipropertysignature.md)<!-- -->, which represents a property belonging to an interface. For example, a class property can be `static` but an interface property cannot.


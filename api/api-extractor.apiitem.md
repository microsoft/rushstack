[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiItem](./api-extractor.apiitem.md)

## ApiItem class

The abstract base class for all members of an `ApiModel` object.

<b>Signature:</b>

```typescript
export declare class ApiItem 
```

## Properties

|  <p>Property</p> | <p>Modifiers</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- | --- |
|  <p>[\_\_computed](./api-extractor.apiitem.__computed.md)</p> |  | <p>`ApiItem | undefined`</p> |  |
|  <p>[canonicalReference](./api-extractor.apiitem.canonicalreference.md)</p> |  | <p>`string`</p> | <p></p> |
|  <p>[displayName](./api-extractor.apiitem.displayname.md)</p> |  | <p>`string`</p> | <p>Returns a name for this object that can be used in diagnostic messages, for example.</p> |
|  <p>[kind](./api-extractor.apiitem.kind.md)</p> |  | <p>`ApiItemKind`</p> | <p></p> |
|  <p>[members](./api-extractor.apiitem.members.md)</p> |  | <p>`ReadonlyArray<ApiItem>`</p> | <p>This property supports a visitor pattern for walking the tree. For items with ApiItemContainerMixin, it returns the contained items. Otherwise it returns an empty array.</p> |
|  <p>[parent](./api-extractor.apiitem.parent.md)</p> |  | <p>`ApiItem | undefined`</p> | <p>If this item was added to a ApiItemContainerMixin item, then this returns the container item. If this is an Parameter that was added to a method or function, then this returns the function item. Otherwise, it returns undefined.</p> |

## Methods

|  <p>Method</p> | <p>Modifiers</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[deserialize(jsonObject)](./api-extractor.apiitem.deserialize.md)</p> | <p>`static`</p> |  |
|  <p>[getAssociatedPackage()](./api-extractor.apiitem.getassociatedpackage.md)</p> |  | <p>If this item is an ApiPackage or has an ApiPackage as one of its parents, then that object is returned. Otherwise undefined is returned.</p> |
|  <p>[getHierarchy()](./api-extractor.apiitem.gethierarchy.md)</p> |  | <p>Returns the chain of ancestors, starting from the root of the tree, and ending with the this item.</p> |
|  <p>[getScopedNameWithinPackage()](./api-extractor.apiitem.getscopednamewithinpackage.md)</p> |  | <p>This returns a scoped name such as `"Namespace1.Namespace2.MyClass.myMember()"`<!-- -->. It does not include the package name or entry point.</p> |
|  <p>[getSortKey()](./api-extractor.apiitem.getsortkey.md)</p> |  | <p></p> |
|  <p>[onDeserializeInto(options, jsonObject)](./api-extractor.apiitem.ondeserializeinto.md)</p> | <p>`static`</p> | <p></p> |
|  <p>[serializeInto(jsonObject)](./api-extractor.apiitem.serializeinto.md)</p> |  | <p></p> |

## Remarks

This is part of the [ApiModel](./api-extractor.apimodel.md) hierarchy of classes, which are serializable representations of API declarations.


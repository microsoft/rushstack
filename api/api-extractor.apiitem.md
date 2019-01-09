[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiItem](./api-extractor.apiitem.md)

## ApiItem class

The abstract base class for all members of an `ApiModel` object.

<b>Signature:</b>

```typescript
export declare class ApiItem 
```

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [\_\_computed](./api-extractor.apiitem.__computed.md) |  | `ApiItem | undefined` |  |
|  [canonicalReference](./api-extractor.apiitem.canonicalreference.md) |  | `string` |  |
|  [displayName](./api-extractor.apiitem.displayname.md) |  | `string` | Returns a name for this object that can be used in diagnostic messages, for example. |
|  [kind](./api-extractor.apiitem.kind.md) |  | `ApiItemKind` |  |
|  [members](./api-extractor.apiitem.members.md) |  | `ReadonlyArray<ApiItem>` | This property supports a visitor pattern for walking the tree. For items with ApiItemContainerMixin, it returns the contained items. Otherwise it returns an empty array. |
|  [parent](./api-extractor.apiitem.parent.md) |  | `ApiItem | undefined` | If this item was added to a ApiItemContainerMixin item, then this returns the container item. If this is an Parameter that was added to a method or function, then this returns the function item. Otherwise, it returns undefined. |

## Methods

|  Method | Modifiers | Description |
|  --- | --- | --- |
|  [deserialize(jsonObject)](./api-extractor.apiitem.deserialize.md) | `static` |  |
|  [getAssociatedPackage()](./api-extractor.apiitem.getassociatedpackage.md) |  | If this item is an ApiPackage or has an ApiPackage as one of its parents, then that object is returned. Otherwise undefined is returned. |
|  [getHierarchy()](./api-extractor.apiitem.gethierarchy.md) |  | Returns the chain of ancestors, starting from the root of the tree, and ending with the this item. |
|  [getScopedNameWithinPackage()](./api-extractor.apiitem.getscopednamewithinpackage.md) |  | This returns a scoped name such as `"Namespace1.Namespace2.MyClass.myMember()"`<!-- -->. It does not include the package name or entry point. |
|  [getSortKey()](./api-extractor.apiitem.getsortkey.md) |  |  |
|  [onDeserializeInto(options, jsonObject)](./api-extractor.apiitem.ondeserializeinto.md) | `static` |  |
|  [serializeInto(jsonObject)](./api-extractor.apiitem.serializeinto.md) |  |  |

## Remarks

This is part of the [ApiModel](./api-extractor.apimodel.md) hierarchy of classes, which are serializable representations of API declarations.


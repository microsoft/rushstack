<!-- docId=sp-webpart-base.baseclientsidewebpart.onafterdeserialize -->

[Home](./index.md) &gt; [sp-webpart-base](./sp-webpart-base.md) &gt; [BaseClientSideWebPart](./sp-webpart-base.baseclientsidewebpart.md)

# BaseClientSideWebPart.onAfterDeserialize method

This API is called after the web part is deserialized to an object, right before the property bag is populated. The default implementation is a no-op. A web part developer can override this API if the deserialized object does not fully reflect the initial state of the property bag. This gives the web part developer a chance to populate the property bag right after the data is deserialized to an object.

**Signature:**
```javascript
@virtual protected onAfterDeserialize(deserializedObject: any, dataVersion: Version): TProperties;
```
**Returns:** `TProperties`

The property bag of the web part

## Remarks

An important scenario to use deserialize is upgrading. An upgraded web part may load the data that was serialized by an older version of the web part that supported a different schema of the property bag, resulting the deserialized object to be incosistent with the current schema of the property bag. The developer can use onAfterDeserialize to check the dataVersion and fix the property bag.

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `deserializedObject` | `any` | The object deserialized from the stored data. Note that the schema of this object is not necessarily consistent with the current property bag, because the serialization could have been done by an older version of the web part |
|  `dataVersion` | `Version` | The data version of the stored data being deserialized. You can use this value to determine if the data was serialized by an older web part. Web parts can define their data version by overriding the dataVersion property. |


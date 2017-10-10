[Home](./index) &gt; [local](local.md) &gt; [Excel\_Range](local.excel_range.md) &gt; [getUsedRange](local.excel_range.getusedrange.md)

# Excel\_Range.getUsedRange method

Returns the used range of the given range object. If there are no used cells within the range, this function will throw an ItemNotFound error. 

 \[Api set: ExcelApi 1.1\]

**Signature:**
```javascript
getUsedRange(valuesOnly?: boolean): Excel.Range;
```
**Returns:** `Excel.Range`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `valuesOnly` | `boolean` |  |


[Home](./index) &gt; [local](local.md) &gt; [Excel\_Range](local.excel_range.md) &gt; [getBoundingRect](local.excel_range.getboundingrect.md)

# Excel\_Range.getBoundingRect method

Gets the smallest range object that encompasses the given ranges. For example, the GetBoundingRect of "B2:C5" and "D10:E15" is "B2:E16". 

 \[Api set: ExcelApi 1.1\]

**Signature:**
```javascript
getBoundingRect(anotherRange: Excel.Range | string): Excel.Range;
```
**Returns:** `Excel.Range`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `anotherRange` | `Excel.Range | string` |  |


[Home](./index) &gt; [local](local.md) &gt; [Excel\_Functions](local.excel_functions.md) &gt; [replaceB](local.excel_functions.replaceb.md)

# Excel\_Functions.replaceB method

Replaces part of a text string with a different text string. Use with double-byte character sets (DBCS). 

 \[Api set: ExcelApi 1.2\]

**Signature:**
```javascript
replaceB(oldText: string | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, startNum: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, numBytes: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, newText: string | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>): FunctionResult<string>;
```
**Returns:** `FunctionResult<string>`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `oldText` | `string | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `startNum` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `numBytes` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `newText` | `string | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |


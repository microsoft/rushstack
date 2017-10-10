[Home](./index) &gt; [local](local.md) &gt; [Excel\_Functions](local.excel_functions.md) &gt; [midb](local.excel_functions.midb.md)

# Excel\_Functions.midb method

Returns characters from the middle of a text string, given a starting position and length. Use with double-byte character sets (DBCS). 

 \[Api set: ExcelApi 1.2\]

**Signature:**
```javascript
midb(text: string | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, startNum: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, numBytes: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>): FunctionResult<string>;
```
**Returns:** `FunctionResult<string>`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `text` | `string | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `startNum` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `numBytes` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |


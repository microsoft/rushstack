[Home](./index) &gt; [local](local.md) &gt; [Excel\_Functions](local.excel_functions.md) &gt; [hyperlink](local.excel_functions.hyperlink.md)

# Excel\_Functions.hyperlink method

Creates a shortcut or jump that opens a document stored on your hard drive, a network server, or on the Internet. 

 \[Api set: ExcelApi 1.2\]

**Signature:**
```javascript
hyperlink(linkLocation: string | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, friendlyName?: number | string | boolean | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>): FunctionResult<number | string | boolean>;
```
**Returns:** `FunctionResult<number | string | boolean>`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `linkLocation` | `string | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `friendlyName` | `number | string | boolean | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |


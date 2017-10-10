[Home](./index) &gt; [local](local.md) &gt; [Excel\_Functions](local.excel_functions.md) &gt; [fixed](local.excel_functions.fixed.md)

# Excel\_Functions.fixed method

Rounds a number to the specified number of decimals and returns the result as text with or without commas. 

 \[Api set: ExcelApi 1.2\]

**Signature:**
```javascript
fixed(number: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, decimals?: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, noCommas?: boolean | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>): FunctionResult<string>;
```
**Returns:** `FunctionResult<string>`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `number` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `decimals` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `noCommas` | `boolean | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |


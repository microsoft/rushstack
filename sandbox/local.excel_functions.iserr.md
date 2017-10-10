[Home](./index) &gt; [local](local.md) &gt; [Excel\_Functions](local.excel_functions.md) &gt; [isErr](local.excel_functions.iserr.md)

# Excel\_Functions.isErr method

Checks whether a value is an error (\#VALUE!, \#REF!, \#DIV/0!, \#NUM!, \#NAME?, or \#NULL!) excluding \#N/A, and returns TRUE or FALSE. 

 \[Api set: ExcelApi 1.2\]

**Signature:**
```javascript
isErr(value: number | string | boolean | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>): FunctionResult<boolean>;
```
**Returns:** `FunctionResult<boolean>`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `value` | `number | string | boolean | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |


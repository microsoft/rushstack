[Home](./index) &gt; [local](local.md) &gt; [Excel\_Functions](local.excel_functions.md) &gt; [dmin](local.excel_functions.dmin.md)

# Excel\_Functions.dmin method

Returns the smallest number in the field (column) of records in the database that match the conditions you specify. 

 \[Api set: ExcelApi 1.2\]

**Signature:**
```javascript
dmin(database: Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, field: number | string | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, criteria: string | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>): FunctionResult<number>;
```
**Returns:** `FunctionResult<number>`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `database` | `Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `field` | `number | string | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `criteria` | `string | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |


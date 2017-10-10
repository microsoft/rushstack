[Home](./index) &gt; [local](local.md) &gt; [Excel\_Functions](local.excel_functions.md) &gt; [dproduct](local.excel_functions.dproduct.md)

# Excel\_Functions.dproduct method

Multiplies the values in the field (column) of records in the database that match the conditions you specify. 

 \[Api set: ExcelApi 1.2\]

**Signature:**
```javascript
dproduct(database: Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, field: number | string | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, criteria: string | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>): FunctionResult<number>;
```
**Returns:** `FunctionResult<number>`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `database` | `Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `field` | `number | string | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `criteria` | `string | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |


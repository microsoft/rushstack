[Home](./index) &gt; [local](local.md) &gt; [Excel\_Functions](local.excel_functions.md) &gt; [f\_Inv](local.excel_functions.f_inv.md)

# Excel\_Functions.f\_Inv method

Returns the inverse of the (left-tailed) F probability distribution: if p = F.DIST(x,...), then F.INV(p,...) = x. 

 \[Api set: ExcelApi 1.2\]

**Signature:**
```javascript
f_Inv(probability: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, degFreedom1: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, degFreedom2: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>): FunctionResult<number>;
```
**Returns:** `FunctionResult<number>`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `probability` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `degFreedom1` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `degFreedom2` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |


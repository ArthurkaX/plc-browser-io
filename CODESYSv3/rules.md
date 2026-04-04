# IEC 61131-3 Structured Text Block Syntax Reference

This document provides syntax templates for all supported IEC 61131-3 block structures, independent of project organization. Use these templates as reference when creating new blocks.

**Note:** In CODESYS, END keywords (END_FUNCTION, END_METHOD, END_PROGRAM, etc.) are optional and not used in this codebase. Block boundaries are inferred from context.

---

## 1. FUNCTION

**Purpose:** Reusable code block that performs a calculation and returns a value. No internal state memory.

### Syntax Template

```
FUNCTION <FunctionName> : <ReturnType>

VAR_INPUT
  // Input variables (required if needed)
  <VarName> : <Type>;
  <VarName> : <Type> := <DefaultValue>;
END_VAR

VAR
  // Local variables (optional)
  <VarName> : <Type>;
  <VarName> : <Type> := <DefaultValue>;
END_VAR

VAR_OUTPUT
  // Output variables (optional)
  <VarName> : <Type>;
END_VAR

VAR_CONSTANT
  // Constants (optional)
  <ConstantName> : <Type> := <Value>;
END_VAR

// === IMPLEMENTATION ===
// Function body
<FunctionName> := <Expression>;
```

### Required Parts
- FUNCTION declaration with return type
- Implementation section with return assignment

### Optional Parts
- VAR_INPUT section
- VAR section
- VAR_OUTPUT section
- VAR_CONSTANT section

### Example

```structured_text
FUNCTION fcASCIIplacement : STRING(24)
VAR_INPUT
  dwInput : DWORD;
END_VAR
VAR
END_VAR

// === IMPLEMENTATION ===
fcASCIIplacement := '________________________';

// If dwInput.%X0 = TRUE, replace first character
IF dwInput.%X0 THEN fcASCIIplacement[0] := 35; END_IF
IF dwInput.%X1 THEN fcASCIIplacement[1] := 35; END_IF
```

---

## 2. FUNCTION_BLOCK

**Purpose:** Reusable code block with internal state memory. Can contain methods and properties.

### Syntax Template

```
{attribute '<AttributeName>'}
FUNCTION_BLOCK <BlockName>

VAR_CONSTANT
  // Constants (optional)
  <ConstantName> : <Type> := <Value>;
END_VAR

VAR_INPUT
  // Input variables (required if needed)
  <VarName> : <Type>;
  <VarName> : <Type> := <DefaultValue>;
END_VAR

VAR_OUTPUT
  // Output variables (optional)
  <VarName> : <Type>;
END_VAR

VAR
  // Internal variables (required if needed)
  <VarName> : <Type>;
  <VarName> : <Type> := <DefaultValue>;
END_VAR

VAR_IN_OUT
  // Bidirectional variables (optional)
  <VarName> : <Type>;
END_VAR

// === IMPLEMENTATION ===
// Function block body
<CodeLogic>;
```

### Required Parts
- FUNCTION_BLOCK declaration
- At least one variable section (VAR_INPUT, VAR_OUTPUT, or VAR)
- Implementation section

### Optional Parts
- VAR_CONSTANT section
- VAR_IN_OUT section
- Attributes before declaration

### Example

```structured_text
FUNCTION_BLOCK B_TRIG
VAR_INPUT
  CLK : BOOL;
END_VAR

VAR_OUTPUT
  B_Q : BOOL;
  R_Q : BOOL;
  F_Q : BOOL;
END_VAR

VAR
  auxMem : BOOL;
END_VAR

// === IMPLEMENTATION ===
R_Q := CLK AND NOT auxMem;
F_Q := NOT CLK AND auxMem;
B_Q := R_Q OR F_Q;

auxMem := CLK;
```

---

## 3. PROGRAM

**Purpose:** Top-level executable block, typically called from a task. Similar to FUNCTION_BLOCK but used as program entry point.

### Syntax Template

```
{attribute '<AttributeName>'}
PROGRAM <ProgramName>

VAR
  // Local variables (required if needed)
  <VarName> : <Type>;
  <VarName> : <Type> := <DefaultValue>;
END_VAR

VAR_INPUT
  // Input variables (optional)
  <VarName> : <Type>;
END_VAR

VAR_OUTPUT
  // Output variables (optional)
  <VarName> : <Type>;
END_VAR

VAR_IN_OUT
  // Bidirectional variables (optional)
  <VarName> : <Type>;
END_VAR

// === IMPLEMENTATION ===
// Program body
<CodeLogic>;
```

### Required Parts
- PROGRAM declaration
- At least one variable section
- Implementation section

### Optional Parts
- VAR_INPUT section
- VAR_OUTPUT section
- VAR_IN_OUT section
- Attributes before declaration

### Example

```structured_text
PROGRAM BACKGROUND
VAR
  tLogArchive   : UINT;
  IEC_RES       : RTS_IEC_RESULT;
  CarStatus     : STRING(10);
END_VAR

// === IMPLEMENTATION ===
IF tLogArchive > 1200 THEN
  SysProcessExecuteCommand(pszComand := 'bash /var/opt/codesys/PlcLogic/Application/CopyLog.sh', pResult := ADR(IEC_RES));
  tLogArchive := 0;
ELSE
  tLogArchive := tLogArchive + 1;
END_IF

// Carrier status logic
// ... additional code
```

---

## 4. METHOD

**Purpose:** Encapsulated function within a FUNCTION_BLOCK or CLASS. Can have access modifiers.

### Syntax Template

```
METHOD <MethodName> : <ReturnType>
{PRIVATE | PUBLIC}

VAR_INPUT
  // Input variables (optional)
  <VarName> : <Type>;
END_VAR

VAR_IN_OUT
  // Bidirectional variables (optional)
  <VarName> : <Type>;
END_VAR

VAR
  // Local variables (optional)
  <VarName> : <Type>;
END_VAR

// === IMPLEMENTATION ===
// Method body
<MethodName> := <Expression>;
```

### Required Parts
- METHOD declaration with return type (or VOID)
- Implementation section

### Optional Parts
- Access modifier (PRIVATE or PUBLIC)
- VAR_INPUT section
- VAR_IN_OUT section
- VAR section

### Example

```structured_text
METHOD controlButtons : BOOL
VAR_INPUT
END_VAR

VAR
  auxString : STRING;
END_VAR

// === IMPLEMENTATION ===
IF trStartHMI.Q THEN
  auxString := 'Button Start is pressed from HMI';
  sys.Logger.LogADDLong(Component := LogComponent.userAction,
                        LogClass  := cmplog.LogClass.LOG_INFO,
                        Message   := auxString);
END_IF

controlButtons := TRUE;
```

---

## 5. PROPERTY

**Purpose:** Get/set accessor for data within a FUNCTION_BLOCK or CLASS. Provides controlled access to internal variables.

### Syntax Template

```
PROPERTY <PropertyName> : <Type>

// === GET ===
VAR
  // Get-accessor local variables (optional)
END_VAR

// === IMPLEMENTATION ===
<PropertyName> := <Expression>;

// === SET ===
VAR
  // Set-accessor local variables (optional)
END_VAR

// === IMPLEMENTATION ===
<InternalVariable> := <PropertyName>;
```

### Required Parts
- PROPERTY declaration with type
- GET section with implementation
- SET section with implementation (if write access needed)

### Optional Parts
- VAR sections within GET or SET

### Example

```structured_text
PROPERTY inSeqNumber : udint

// === GET ===
VAR
END_VAR

// === IMPLEMENTATION ===
inSeqNumber := internalSeqNumber;

// === SET ===
VAR
END_VAR

// === IMPLEMENTATION ===
internalSeqNumber := inSeqNumber;
```

---

## 6. TYPE - STRUCT

**Purpose:** Define complex data structures grouping related variables.

### Syntax Template

```
{attribute '<AttributeName>'}
{attribute '<AttributeName>'}
TYPE <TypeName> :
STRUCT
  <MemberName> : <Type>;
  <MemberName> : <Type> := <DefaultValue>;
  <MemberName> : <ArrayType>;
END_STRUCT
END_TYPE
```

### Required Parts
- TYPE declaration
- STRUCT block
- At least one member
- END_STRUCT
- END_TYPE

### Optional Parts
- Attributes before TYPE declaration
- Default values for members

### Example

```structured_text
TYPE CARRIER :
STRUCT
  position                : DINT;
  status                  : Carrier_status;
  Bag_length              : DINT;
  Bag_begin               : DINT;
  Bag_finish              : DINT;
  Destination             : STRING(3);
  Car_Check_Counter       : DINT;
  Error_counter           : INT;
  Reset_Attempt_Counter   : INT;
  name                    : STRING;
  MSR_CALL_STATUS         : BOOL;
  seq_number              : UDINT;
  seq_timestamp           : TIME;
  Get_Info                : GetInfo;
  Flash_rom_modbus        : ARRAY[1..246] OF BYTE := [0];
  Flash_rom_read          : BOOL;
END_STRUCT
```

---

## 7. TYPE - ENUM

**Purpose:** Define a set of named constant values.

### Syntax Template

```
{attribute 'qualified_only'}
{attribute 'strict'}
TYPE <TypeName> : (
  <EnumValue> := <NumericValue>,
  <EnumValue> := <NumericValue>,
  <EnumValue> := <NumericValue>
)<BaseType>;
```

### Required Parts
- TYPE declaration with base type
- Parenthesized list of values
- At least one enum value
- Base type specification

### Optional Parts
- 'qualified_only' attribute
- 'strict' attribute
- Numeric value assignments (auto-increment if omitted)

### Example

```structured_text
{attribute 'qualified_only'}
{attribute 'strict'}
TYPE ATR_STATE : (
  INIT := 0,    // Initialization state
  IDLE := 10,   // Idle state
  CHECK := 15,   // Check carrier for Occupation
  SEND := 20,   // Send state
  SCAN := 30,   // Scan state
  RESET := 40   // Reset state
)USINT;
```

---

## 8. TYPE - UNION

**Purpose:** Define a data type that can hold different types in the same memory location.

### Syntax Template

```
TYPE <TypeName> :
UNION
  <MemberName> : <Type>;
  <MemberName> : <Type>;
  <MemberName> : <ArrayType>;
END_UNION
```

### Required Parts
- TYPE declaration
- UNION block
- At least two members
- END_UNION

### Optional Parts
- None

### Example

```structured_text
TYPE union_2bytes_int_TCTC :
UNION
  inBYTE : ARRAY[0..1] OF BYTE;
  outINT : INT;
END_UNION
```

```structured_text
TYPE union_4bytes_dw :
UNION
  inBYTE : ARRAY[0..3] OF BYTE;
  outDW : DWORD;
END_UNION
```

---

## 9. TYPE - ARRAY

**Purpose:** Define array types for reuse. Can be standalone or within STRUCT/UNION.

### Syntax Template

```
// Standalone array type
TYPE <TypeName> : ARRAY [<StartIndex>..<EndIndex>] OF <ElementType>;

// Array within STRUCT
<MemberName> : ARRAY [<StartIndex>..<EndIndex>] OF <ElementType> := [<Value1>, <Value2>, ...];
```

### Required Parts
- ARRAY keyword
- Index range specification
- OF keyword
- Element type

### Optional Parts
- Default initialization values (for non-standalone arrays)

### Example

```structured_text
// Within STRUCT
scanSeqLinkArray : ARRAY[1..uiBufferSize] OF DUT_scanATR_90;
Flash_rom_modbus : ARRAY[1..246] OF BYTE := [0];

// With structure initialization
CAR : ARRAY[1..PARAMETER.carrierNumber] OF CARRIER := [
  (name := 'tray 001', status := Carrier_status.NONE),
  (name := 'tray 002', status := Carrier_status.NONE)
];
```

---

## 10. VARIABLE DECLARATION SECTIONS

### VAR_INPUT

**Purpose:** Define input parameters that are read-only within the block.

```structured_text
VAR_INPUT
  <VarName> : <Type>;
  <VarName> : <Type> := <DefaultValue>;
  <VarName> : STRING(<Length>);
END_VAR
```

### VAR_OUTPUT

**Purpose:** Define output parameters that can be written to and read by calling code.

```structured_text
VAR_OUTPUT
  <VarName> : <Type>;
  <VarName> : <Type> := <DefaultValue>;
  <VarName> : STRING(<Length>);
END_VAR
```

### VAR

**Purpose:** Define internal variables for local state storage.

```structured_text
VAR
  <VarName> : <Type>;
  <VarName> : <Type> := <DefaultValue>;
  <VarName> : ARRAY[<Start>..<End>] OF <Type>;
END_VAR
```

### VAR_IN_OUT

**Purpose:** Define bidirectional variables that can be both read and modified.

```structured_text
VAR_IN_OUT
  <VarName> : <Type>;
  <VarName> : <StructType>;
END_VAR
```

### VAR_CONSTANT

**Purpose:** Define compile-time constant values.

```structured_text
VAR_CONSTANT
  <ConstantName> : <Type> := <Value>;
  <ConstantName> : TIME := T#<TimeValue>;
END_VAR
```

### VAR_TEMP

**Purpose:** Define temporary variables cleared each execution cycle (valid in FUNCTIONS and METHODS only).

```structured_text
VAR_TEMP
  <TempVarName> : <Type>;
  <TempVarName> : STRING(<Length>);
END_VAR
```

---

## 11. ATTRIBUTES REFERENCE

### 'no_assign'

**Purpose:** Prevents compiler from assigning default values to uninitialized variables.

```
{attribute 'no_assign'}
```

**Placement:** Before FUNCTION_BLOCK or FUNCTION declaration.

### 'qualified_only'

**Purpose:** Requires enum values to be accessed with full qualification (TypeName.EnumValue).

```
{attribute 'qualified_only'}
```

**Placement:** Before ENUM TYPE declaration.

### 'strict'

**Purpose:** Enables strict type checking, preventing implicit type conversions.

```
{attribute 'strict'}
```

**Placement:** Before ENUM TYPE declaration.

### 'symbol'

**Purpose:** Controls whether the variable is exported to the symbol list.

```
{attribute 'symbol' := 'none'}
```

**Placement:** Before TYPE or PROGRAM declaration.

---

## 12. COMMON DATA TYPES

### Basic Types

```
BOOL      : Boolean
BYTE      : 8-bit unsigned
WORD      : 16-bit unsigned
DWORD     : 32-bit unsigned
LWORD     : 64-bit unsigned
SINT      : 8-bit signed
INT       : 16-bit signed
DINT      : 32-bit signed
LINT      : 64-bit signed
USINT     : 8-bit unsigned
UINT      : 16-bit unsigned
UDINT     : 32-bit unsigned
ULINT     : 64-bit unsigned
REAL      : 32-bit floating point
LREAL     : 64-bit floating point
TIME      : Time duration
TOD       : Time of day
DATE      : Date
DT        : Date and time
STRING    : String (default 255 chars)
STRING(n) : String with length n
WSTRING   : Wide string
```

### Time Literals

```
T#<value><unit>
Units: MS (milliseconds), S (seconds), M (minutes), H (hours)
Examples: T#500MS, T#5S, T#2M, T#1H30M
```

### Hexadecimal Literals

```
16#<hexadecimal_value>
Examples: 16#FF, 16#02440001, 16#44
```

---

## 13. IMPLEMENTATION SECTION

### Structure

The implementation section always follows variable declaration sections and contains executable code.

```
// === IMPLEMENTATION ===
// Optional: comments describing the implementation
<ExecutableCode>;
```

### Common Patterns

**State Machine:**
```structured_text
CASE STATE OF
  STATE_INIT:
    // Initialization logic
    NEXT_STATE := STATE_IDLE;

  STATE_IDLE:
    // Idle logic
    IF <Condition> THEN
      NEXT_STATE := STATE_ACTIVE;
    END_IF;

  STATE_ACTIVE:
    // Active logic
    IF <Condition> THEN
      NEXT_STATE := STATE_IDLE;
    END_IF;

END_CASE
```

**Loop:**
```structured_text
FOR <Index> := <Start> TO <End> BY <Step> DO
  // Loop body
  IF <ExitCondition> THEN
    EXIT;
  END_IF;
  IF <SkipCondition> THEN
    CONTINUE;
  END_IF;
END_FOR
```

---

## SUMMARY OF BLOCK TYPES

| Block Type | State Memory | Return Value | Can Have Methods | Can Have Properties |
|-----------|-------------|--------------|-----------------|-------------------|
| FUNCTION | No | Yes | No | No |
| FUNCTION_BLOCK | Yes | No | Yes | Yes |
| PROGRAM | Yes | No | No | No |
| METHOD | No | Yes/No | No | No |
| PROPERTY | No | Yes | No | No |

---

**Note:** This reference focuses on syntax structure only. Naming conventions and business logic patterns should be defined in your project-specific guidelines.

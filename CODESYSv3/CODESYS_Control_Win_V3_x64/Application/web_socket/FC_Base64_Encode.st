FUNCTION FC_Base64_Encode : STRING(40)
VAR_INPUT
	pData  : POINTER TO BYTE;  // Pointer to input data
	uiLen  : UINT;             // Length of input data (max ~27 bytes for STRING(40) output)
END_VAR
VAR
	B64    : STRING(64) := 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
	i      : INT;
	outIdx : INT;
	a      : INT;       // Accumulated bits count
	b      : DWORD;     // Bit buffer
	pSrc   : POINTER TO BYTE;
	val    : INT;
	pOut   : POINTER TO BYTE;
	padCount : INT;
END_VAR

(*
	Synchronous Base64 encoder for raw byte arrays.
	Based on OSCAT BASE64_ENCODE_STREAM logic.
	Used for WebSocket handshake (encoding 20-byte SHA-1 hash -> 28-char base64).
*)

// === IMPLEMENTATION ===
FC_Base64_Encode := '';
pOut := ADR(FC_Base64_Encode);
outIdx := 0;
a := 0;
b := 0;

FOR i := 0 TO UINT_TO_INT(uiLen) - 1 DO
	b := SHL(b, 8) OR BYTE_TO_DWORD(pData[i]);
	a := a + 8;
	
	WHILE a >= 6 DO
		a := a - 6;
		val := DWORD_TO_INT(SHR(b, a) AND 16#3F);
		// Index into B64 string (1-based in ST)
		pOut[outIdx] := B64[val];
		outIdx := outIdx + 1;
		b := b AND NOT SHL(DWORD#16#FFFFFFFF, a);
	END_WHILE;
END_FOR;

// Handle remaining bits + padding
IF a > 0 THEN
	val := DWORD_TO_INT(SHL(b, 6 - a) AND 16#3F);
	pOut[outIdx] := B64[val];
	outIdx := outIdx + 1;
	
	// Pad with '=' to make length multiple of 4
	padCount := (4 - (outIdx MOD 4)) MOD 4;
	FOR i := 1 TO padCount DO
		pOut[outIdx] := 61; // '=' = ASCII 61
		outIdx := outIdx + 1;
	END_FOR;
END_IF;

// Null terminator
pOut[outIdx] := 0;
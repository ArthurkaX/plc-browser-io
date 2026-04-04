FUNCTION FC_WS_BuildFrame : UINT
VAR_INPUT
	eOpcode     : E_WS_Opcode;         // Frame opcode
	pPayload    : POINTER TO BYTE;     // Pointer to payload data
	uiPayloadLen: UINT;                // Payload length
	xFin        : BOOL := TRUE;        // FIN bit (TRUE = final frame)
END_VAR
VAR_IN_OUT
	abOutBuf    : ARRAY [0..1023] OF BYTE;  // Output: built frame
END_VAR
VAR
	idx       : UINT;
	i         : UINT;
	byte0     : BYTE;
	pSrc      : POINTER TO BYTE;
END_VAR

(*
	Builds a WebSocket frame for SENDING from server to client.
	Server frames are NOT masked (RFC 6455 Section 5.1).
	Returns total frame length in bytes.
*)

// === IMPLEMENTATION ===
idx := 0;

// Byte 0: FIN + Opcode
byte0 := eOpcode;
IF xFin THEN
	byte0 := byte0 OR 16#80;
END_IF;
abOutBuf[0] := byte0;
idx := 1;

// Byte 1+: Payload length (no mask bit for server frames)
IF uiPayloadLen < 126 THEN
	abOutBuf[1] := UINT_TO_BYTE(uiPayloadLen);
	idx := 2;
ELSIF uiPayloadLen < 65535 THEN
	abOutBuf[1] := 126;
	abOutBuf[2] := UINT_TO_BYTE(SHR(uiPayloadLen, 8));
	abOutBuf[3] := UINT_TO_BYTE(uiPayloadLen AND 16#FF);
	idx := 4;
END_IF;

// Copy payload data
FOR i := 0 TO uiPayloadLen - 1 DO
	IF UINT_TO_INT(idx + i) > 1023 THEN
		EXIT;
	END_IF;
	abOutBuf[idx + i] := pPayload[i];
END_FOR;

FC_WS_BuildFrame := idx + uiPayloadLen;
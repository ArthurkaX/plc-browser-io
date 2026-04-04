FUNCTION FC_WS_ParseFrame : BOOL
VAR_INPUT
	pData     : POINTER TO BYTE;
	uiDataLen : UINT;
END_VAR
VAR_IN_OUT
	stFrame   : ST_WS_Frame;
END_VAR
VAR
	byte0       : BYTE;
	byte1       : BYTE;
	payloadLen7 : BYTE;
	maskStart   : UINT;
	payloadStart: UINT;
	i           : UINT;
	dwOff       : DWORD;
	pByte       : POINTER TO BYTE;
	bMaskIdx    : INT;
END_VAR

// === IMPLEMENTATION ===
FC_WS_ParseFrame := FALSE;
stFrame.xValid := FALSE;

IF uiDataLen < 2 THEN
	RETURN;
END_IF;

// Read byte 0 and byte 1 using direct pointer offset
byte0 := pData^;
dwOff := 1;
pByte := pData + dwOff;
byte1 := pByte^;

// Parse header fields
stFrame.xFin    := (byte0 AND 16#80) = 16#80;
stFrame.xMasked := (byte1 AND 16#80) = 16#80;

// Opcode - cast via BYTE to avoid strict enum error
CASE BYTE_TO_INT(byte0 AND 16#0F) OF
	0:  stFrame.eOpcode := E_WS_Opcode.CONTINUATION;
	1:  stFrame.eOpcode := E_WS_Opcode.TEXT;
	2:  stFrame.eOpcode := E_WS_Opcode.BINARY;
	8:  stFrame.eOpcode := E_WS_Opcode.CLOSE;
	9:  stFrame.eOpcode := E_WS_Opcode.PING;
	10: stFrame.eOpcode := E_WS_Opcode.PONG;
ELSE
	stFrame.eOpcode := E_WS_Opcode.CONTINUATION;
END_CASE;

payloadLen7 := byte1 AND 16#7F;

IF payloadLen7 < 126 THEN
	stFrame.udiPayloadLen := BYTE_TO_UDINT(payloadLen7);
	maskStart := 2;
ELSIF payloadLen7 = 126 THEN
	IF uiDataLen < 4 THEN RETURN; END_IF;
	dwOff := 2; pByte := pData + dwOff;
	stFrame.udiPayloadLen := SHL(BYTE_TO_UDINT(pByte^), 8);
	dwOff := 3; pByte := pData + dwOff;
	stFrame.udiPayloadLen := stFrame.udiPayloadLen OR BYTE_TO_UDINT(pByte^);
	maskStart := 4;
ELSE
	IF uiDataLen < 10 THEN RETURN; END_IF;
	dwOff := 6; pByte := pData + dwOff; stFrame.udiPayloadLen := SHL(BYTE_TO_UDINT(pByte^), 24);
	dwOff := 7; pByte := pData + dwOff; stFrame.udiPayloadLen := stFrame.udiPayloadLen OR SHL(BYTE_TO_UDINT(pByte^), 16);
	dwOff := 8; pByte := pData + dwOff; stFrame.udiPayloadLen := stFrame.udiPayloadLen OR SHL(BYTE_TO_UDINT(pByte^), 8);
	dwOff := 9; pByte := pData + dwOff; stFrame.udiPayloadLen := stFrame.udiPayloadLen OR BYTE_TO_UDINT(pByte^);
	maskStart := 10;
END_IF;

IF stFrame.xMasked THEN
	IF uiDataLen < maskStart + 4 THEN RETURN; END_IF;
	dwOff := UINT_TO_DWORD(maskStart);     pByte := pData + dwOff; stFrame.abMaskKey[0] := pByte^;
	dwOff := UINT_TO_DWORD(maskStart + 1); pByte := pData + dwOff; stFrame.abMaskKey[1] := pByte^;
	dwOff := UINT_TO_DWORD(maskStart + 2); pByte := pData + dwOff; stFrame.abMaskKey[2] := pByte^;
	dwOff := UINT_TO_DWORD(maskStart + 3); pByte := pData + dwOff; stFrame.abMaskKey[3] := pByte^;
	payloadStart := maskStart + 4;
ELSE
	stFrame.abMaskKey[0] := 0;
	stFrame.abMaskKey[1] := 0;
	stFrame.abMaskKey[2] := 0;
	stFrame.abMaskKey[3] := 0;
	payloadStart := maskStart;
END_IF;

// Validate length
stFrame.uiTotalLen := payloadStart + UDINT_TO_UINT(stFrame.udiPayloadLen);
IF UINT_TO_UDINT(uiDataLen) < UINT_TO_UDINT(payloadStart) + stFrame.udiPayloadLen THEN
	RETURN;
END_IF;
IF stFrame.udiPayloadLen > 1024 THEN
	stFrame.udiPayloadLen := 1024;
END_IF;

// Read and unmask payload (skip if payload is empty, e.g. CLOSE/PING)
IF stFrame.udiPayloadLen > 0 THEN
	FOR i := 0 TO UDINT_TO_UINT(stFrame.udiPayloadLen) - 1 DO
		dwOff := UINT_TO_DWORD(payloadStart + i);
		pByte := pData + dwOff;
		bMaskIdx := UINT_TO_INT(i MOD 4);
		IF stFrame.xMasked THEN
			stFrame.abPayload[i] := pByte^ XOR stFrame.abMaskKey[bMaskIdx];
		ELSE
			stFrame.abPayload[i] := pByte^;
		END_IF;
	END_FOR;
END_IF;

stFrame.xValid := TRUE;
FC_WS_ParseFrame := TRUE;
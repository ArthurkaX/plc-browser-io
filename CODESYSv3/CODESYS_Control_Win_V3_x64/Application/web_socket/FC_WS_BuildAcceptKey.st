FUNCTION FC_WS_BuildAcceptKey : STRING(40)
VAR_INPUT
	sClientKey : STRING(40);
	xDebug     : BOOL := TRUE;
END_VAR
VAR
	sGUID       : STRING(40) := '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
	abHash      : ARRAY [0..19] OF BYTE;
	i           : INT;
	uiKeyLen    : UINT;
	uiGuidLen   : UINT;
	uiTotalLen  : UINT;
	abCombined  : ARRAY [0..79] OF BYTE;
	dwOff       : DWORD;
	pByte       : POINTER TO BYTE;
	pStr        : POINTER TO BYTE;
END_VAR

// === IMPLEMENTATION ===
uiKeyLen  := INT_TO_UINT(LEN(sClientKey));
uiGuidLen := INT_TO_UINT(LEN(sGUID));
uiTotalLen := uiKeyLen + uiGuidLen;

// Log input key details
IF xDebug THEN
	LogComponent.Logger.LogADD(Component:= LogComponent.WS, LogClass:= cmplog.LogClass.LOG_INFO,
		Message:= CONCAT('BuildAcceptKey: keyLen=', TO_STRING(uiKeyLen)));
	LogComponent.Logger.LogADD(Component:= LogComponent.WS, LogClass:= cmplog.LogClass.LOG_INFO,
		Message:= CONCAT('BuildAcceptKey: key=[', CONCAT(sClientKey, ']')));
	LogComponent.Logger.LogADD(Component:= LogComponent.WS, LogClass:= cmplog.LogClass.LOG_INFO,
		Message:= CONCAT('BuildAcceptKey: totalLen=', TO_STRING(uiTotalLen)));
END_IF;

// Copy client key bytes into combined buffer
pStr := ADR(sClientKey);
FOR i := 0 TO UINT_TO_INT(uiKeyLen) - 1 DO
	dwOff := INT_TO_DWORD(i);
	pByte := pStr + dwOff;
	abCombined[i] := pByte^;
END_FOR;

// Copy GUID bytes after the key
pStr := ADR(sGUID);
FOR i := 0 TO UINT_TO_INT(uiGuidLen) - 1 DO
	dwOff := INT_TO_DWORD(i);
	pByte := pStr + dwOff;
	abCombined[UINT_TO_INT(uiKeyLen) + i] := pByte^;
END_FOR;

// SHA-1 hash
FC_SHA1_Bytes(
	pData  := ADR(abCombined),
	udiLen := UINT_TO_UDINT(uiTotalLen),
	abHash := abHash
);

// Log first 4 bytes of SHA1 as hex for verification
IF xDebug THEN
	LogComponent.Logger.LogADD(Component:= LogComponent.WS, LogClass:= cmplog.LogClass.LOG_INFO,
		Message:= CONCAT('SHA1[0..3]: ',
			CONCAT(TO_STRING(abHash[0]), CONCAT(' ',
			CONCAT(TO_STRING(abHash[1]), CONCAT(' ',
			CONCAT(TO_STRING(abHash[2]), CONCAT(' ',
			TO_STRING(abHash[3])))))))));
END_IF;

// Base64 encode 20-byte hash
FC_WS_BuildAcceptKey := FC_Base64_Encode(
	pData := ADR(abHash),
	uiLen := 20
);

LogComponent.Logger.LogADD(Component:= LogComponent.WS, LogClass:= cmplog.LogClass.LOG_INFO,
	Message:= CONCAT('BuildAcceptKey result: ', FC_WS_BuildAcceptKey));
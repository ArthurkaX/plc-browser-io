FUNCTION FC_ExtractWSKey : STRING(40)
VAR_INPUT
	pData     : POINTER TO BYTE;
	uiDataLen : UINT;
END_VAR
VAR
	// Header to search for (ASCII bytes)
	sHeader   : STRING(25) := 'Sec-WebSocket-Key: ';
	uiHdrLen  : UINT;
	
	i         : UINT;
	j         : UINT;
	bMatch    : BOOL;
	bChar     : BYTE;
	
	pKeyStart : POINTER TO BYTE;
	pOut      : POINTER TO BYTE;
	uiKeyLen  : UINT;
	pHdr      : POINTER TO BYTE;
END_VAR

// === IMPLEMENTATION ===
FC_ExtractWSKey := '';

IF pData = 0 OR uiDataLen < 40 THEN
	RETURN;
END_IF;

uiHdrLen := INT_TO_UINT(LEN(sHeader)); // = 19: 'Sec-WebSocket-Key: '
pHdr := ADR(sHeader);

// Scan raw bytes for the header string
i := 0;
WHILE i <= uiDataLen - uiHdrLen DO
	// Try to match header at position i
	bMatch := TRUE;
	FOR j := 0 TO uiHdrLen - 1 DO
		// Compare each byte of pData[i+j] with sHeader[j]
		IF pData[i + j] <> pHdr[j] THEN
			bMatch := FALSE;
			EXIT;
		END_IF;
	END_FOR;
	
	IF bMatch THEN
		// Found header, key starts at i + uiHdrLen
		pKeyStart := pData + UINT_TO_DWORD(i + uiHdrLen);
		
		// Count key length (until CR, LF, space, or end of buffer)
		uiKeyLen := 0;
		WHILE (i + uiHdrLen + uiKeyLen < uiDataLen) AND uiKeyLen < 40 DO
			bChar := pKeyStart[uiKeyLen];
			IF bChar = 16#0D OR bChar = 16#0A OR bChar = 16#20 THEN
				EXIT;
			END_IF;
			uiKeyLen := uiKeyLen + 1;
		END_WHILE;
		
		IF uiKeyLen > 0 THEN
			// Copy key bytes directly into the result string memory
			pOut := ADR(FC_ExtractWSKey);
			FOR j := 0 TO uiKeyLen - 1 DO
				pOut[j] := pKeyStart[j];
			END_FOR;
			pOut[uiKeyLen] := 0; // null-terminate
			
			LogComponent.Logger.LogADD(
				Component := LogComponent.WS,
				LogClass := cmplog.LogClass.LOG_INFO,
				Message := CONCAT('Parsed WS key: ', FC_ExtractWSKey)
			);
		END_IF;
		RETURN;
	END_IF;
	
	i := i + 1;
END_WHILE;

// Not found
LogComponent.Logger.LogADD(
	Component := LogComponent.WS,
	LogClass := cmplog.LogClass.LOG_WARNING,
	Message := 'Header Sec-WebSocket-Key not found in raw buffer'
);
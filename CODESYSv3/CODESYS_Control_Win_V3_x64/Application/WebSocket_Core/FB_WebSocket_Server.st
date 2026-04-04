FUNCTION_BLOCK FB_WebSocket_Server
VAR_INPUT
	xEnable      : BOOL;
	ipAddr       : NBS.IP_ADDR;
	uiPort       : UINT := 8080;
	pSendData    : POINTER TO BYTE;
	uiSendSize   : UINT := 0;
	xSendTrigger : BOOL;
	
	pRecvData    : POINTER TO BYTE;
	uiRecvSize   : UINT := 0;
	xDebug       : BOOL := TRUE;
END_VAR

VAR_OUTPUT
	xRunning         : BOOL;
	xClientConnected : BOOL;
	xHandshakeOK     : BOOL;
	uiReceivedLen    : UINT;
	xNewDataReceived : BOOL;
	eState           : E_WS_State;
	sError           : STRING(80);
END_VAR

VAR
	fbServer     : NBS.TCP_Server;
	fbConnection : NBS.TCP_Connection;
	fbRead       : NBS.TCP_Read;
	fbWrite      : NBS.TCP_Write;

	eStep          : E_WS_State := E_WS_State.IDLE;
	eStepAfterSend : E_WS_State;

	abRecvBuf    : ARRAY [0..2047] OF BYTE;
	abSendBuf    : ARRAY [0..2047] OF BYTE;
	uiRecvLen    : UINT;
	uiSendLen    : UINT;

	stFrame      : ST_WS_Frame;
	abFrameBuf   : ARRAY [0..1023] OF BYTE;
	uiFrameLen   : UINT;
	
	abStreamBuf  : ARRAY [0..4095] OF BYTE;
	uiStreamLen  : UINT;
	uiParseOffset: UINT;

	sClientKey   : STRING(40);
	sAcceptKey   : STRING(40);
	sResponse    : STRING(255);
	uiResponseLen: UINT;

	abPayloadOut : ARRAY [0..31] OF BYTE;

	i, j  : INT;
	dwOff : DWORD;
	pByte : POINTER TO BYTE;
	pStr  : POINTER TO BYTE;

	xSendTrigLast : BOOL;
	xEnableLast   : BOOL;
	xSendPending  : BOOL;
	sLogMsg       : STRING(255);
END_VAR

// === IMPLEMENTATION ===
// Maintenance blocks
IF eStep <> E_WS_State.IDLE THEN
	fbServer(xEnable := TRUE, ipAddr := ipAddr, uiPort := uiPort);
	fbConnection(xEnable := TRUE, hServer := fbServer.hServer);
END_IF;

// Trigger detection
IF xSendTrigger AND NOT xSendTrigLast THEN
	xSendPending := TRUE;
END_IF;
xSendTrigLast := xSendTrigger;

// Global disable
IF NOT xEnable AND eStep <> E_WS_State.IDLE AND eStep <> E_WS_State.CLOSING THEN
	sError := 'User disabled server';
	eStep := E_WS_State.WS_SEND_CLOSE;
END_IF;

xNewDataReceived := FALSE;

// Global Reset Monitoring
IF eStep = E_WS_State.HANDSHAKE_READ OR 
   eStep = E_WS_State.HANDSHAKE_PARSE OR 
   eStep = E_WS_State.HANDSHAKE_SEND OR 
   eStep = E_WS_State.WS_CONNECTED THEN
	
	IF NOT fbConnection.xActive OR fbConnection.xError THEN
		sError := 'TCP Connection lost';
		eStep := E_WS_State.CLOSING;
	END_IF;
END_IF;

CASE eStep OF

E_WS_State.IDLE:
	xRunning := FALSE;
	xClientConnected := FALSE;
	xHandshakeOK := FALSE;
	sError := '';
	IF xEnable THEN
		eStep := E_WS_State.SERVER_STARTING;
	END_IF;

E_WS_State.SERVER_STARTING:
	IF fbServer.xError THEN
		sError := 'TCP_Server failed';
		eStep := E_WS_State.ERROR;
	ELSIF fbServer.hServer <> 0 THEN
		xRunning := TRUE;
		eStep := E_WS_State.CONN_WAITING;
	END_IF;

E_WS_State.CONN_WAITING:
	IF fbConnection.xActive THEN
		xClientConnected := TRUE;
		eStep := E_WS_State.HANDSHAKE_READ;
	ELSIF fbConnection.xError THEN
		sError := 'TCP_Connection error';
		eStep := E_WS_State.ERROR;
	END_IF;

E_WS_State.HANDSHAKE_READ:
	fbRead(xEnable := TRUE, hConnection := fbConnection.hConnection, szSize := SIZEOF(abRecvBuf), pData := ADR(abRecvBuf));
	IF fbRead.xReady AND fbRead.szCount > 0 THEN
		uiRecvLen := TO_UINT(fbRead.szCount);
		fbRead(xEnable := FALSE);
		eStep := E_WS_State.HANDSHAKE_PARSE;
	ELSIF fbRead.xError THEN
		sError := 'Handshake read error';
		eStep := E_WS_State.CLOSING;
	END_IF;

E_WS_State.HANDSHAKE_PARSE:
	sClientKey := FC_ExtractWSKey(pData := ADR(abRecvBuf), uiDataLen := uiRecvLen);
	IF LEN(sClientKey) = 0 THEN
		sError := 'No WS key found';
		eStep := E_WS_State.CLOSING;
	ELSE
		sAcceptKey := FC_WS_BuildAcceptKey(sClientKey := sClientKey, xDebug := xDebug);
		sResponse := 'HTTP/1.1 101 Switching Protocols$0D$0A';
		sResponse := CONCAT(sResponse, 'Upgrade: websocket$0D$0A');
		sResponse := CONCAT(sResponse, 'Connection: Upgrade$0D$0A');
		sResponse := CONCAT(sResponse, 'Sec-WebSocket-Accept: ');
		sResponse := CONCAT(sResponse, sAcceptKey);
		sResponse := CONCAT(sResponse, '$0D$0A$0D$0A');
		
		uiResponseLen := INT_TO_UINT(LEN(sResponse));
		pStr := ADR(sResponse);
		FOR j := 0 TO UINT_TO_INT(uiResponseLen) - 1 DO
			abSendBuf[j] := pStr[j];
		END_FOR;
		uiSendLen := uiResponseLen;
		eStep := E_WS_State.HANDSHAKE_SEND;
	END_IF;

E_WS_State.HANDSHAKE_SEND:
	fbWrite(xExecute := TRUE, hConnection := fbConnection.hConnection, szSize := TO_UDINT(uiSendLen), pData := ADR(abSendBuf));
	IF fbWrite.xDone THEN
		fbWrite(xExecute := FALSE);
		LogComponent.Logger.LogADD(LogClass:= cmplog.LogClass.LOG_INFO, Component:= LogComponent.WS, Message:= 'WS Handshake successful');
		eStep := E_WS_State.WS_CONNECTED;
	ELSIF fbWrite.xError THEN
		sError := 'Handshake send failed';
		eStep := E_WS_State.CLOSING;
	END_IF;

E_WS_State.WS_CONNECTED:
	xHandshakeOK := TRUE;
	// Main loop for data exchange
	// --- 1. RECEIVER (Multi-packet catchup & stream buffering) ---
	// Read into abRecvBuf
	fbRead(xEnable := TRUE, hConnection := fbConnection.hConnection, szSize := SIZEOF(abRecvBuf), pData := ADR(abRecvBuf));
	IF fbRead.xReady AND fbRead.szCount > 0 THEN
		uiRecvLen := TO_UINT(fbRead.szCount);
		
		// Append to stream buffer
		FOR j := 0 TO UINT_TO_INT(uiRecvLen) - 1 DO
			IF uiStreamLen < 4096 THEN
				abStreamBuf[uiStreamLen] := abRecvBuf[j];
				uiStreamLen := uiStreamLen + 1;
			END_IF;
		END_FOR;
		
		// Parse all complete frames from the stream buffer
		uiParseOffset := 0;
		
		WHILE uiParseOffset < uiStreamLen DO
			IF FC_WS_ParseFrame(pData := ADR(abStreamBuf[uiParseOffset]), uiDataLen := uiStreamLen - uiParseOffset, stFrame := stFrame) THEN
				
				CASE stFrame.eOpcode OF
					E_WS_Opcode.TEXT, E_WS_Opcode.BINARY:
						IF pRecvData <> 0 AND uiRecvSize > 0 THEN
							uiReceivedLen := MIN(UDINT_TO_UINT(stFrame.udiPayloadLen), uiRecvSize);
							FOR j := 0 TO UINT_TO_INT(uiReceivedLen) - 1 DO
								pRecvData[j] := stFrame.abPayload[j];
							END_FOR;
							xNewDataReceived := TRUE;
						END_IF;
					E_WS_Opcode.CLOSE:
						sError := 'Client requested close';
						eStep := E_WS_State.WS_SEND_CLOSE;
				END_CASE;
				
				IF stFrame.uiTotalLen > 0 THEN
					uiParseOffset := uiParseOffset + stFrame.uiTotalLen;
				ELSE
					EXIT;
				END_IF;
			ELSE
				EXIT; // Partial frame, wait for more data
			END_IF;
		END_WHILE;
		
		// Shift remaining unparsed bytes to the beginning
		IF uiParseOffset > 0 THEN
			uiStreamLen := uiStreamLen - uiParseOffset;
			FOR j := 0 TO UINT_TO_INT(uiStreamLen) - 1 DO
				abStreamBuf[j] := abStreamBuf[uiParseOffset + INT_TO_UINT(j)];
			END_FOR;
		END_IF;
		
		fbRead(xEnable := FALSE);
	ELSIF fbRead.xError THEN
		eStep := E_WS_State.CLOSING;
	END_IF;

	// --- 2. TRANSMITTER ---
	IF xSendPending AND NOT fbWrite.xBusy THEN
		IF pSendData <> 0 AND uiSendSize > 0 THEN
			uiFrameLen := FC_WS_BuildFrame(eOpcode:= E_WS_Opcode.BINARY, pPayload:= pSendData, uiPayloadLen:= uiSendSize, xFin:= TRUE, abOutBuf:= abFrameBuf);
			FOR j := 0 TO UINT_TO_INT(uiFrameLen) - 1 DO
				abSendBuf[j] := abFrameBuf[j];
			END_FOR;
			fbWrite(xExecute := TRUE, hConnection := fbConnection.hConnection, szSize := TO_UDINT(uiFrameLen), pData := ADR(abSendBuf));
			xSendPending := FALSE;
		ELSE
			xSendPending := FALSE;
		END_IF;
	ELSIF fbWrite.xDone OR fbWrite.xError THEN
		fbWrite(xExecute := FALSE);
	ELSE
		fbWrite();
	END_IF;

E_WS_State.WS_SEND_CLOSE:
	uiFrameLen := FC_WS_BuildFrame(eOpcode := E_WS_Opcode.CLOSE, pPayload := ADR(abFrameBuf), uiPayloadLen := 0, xFin := TRUE, abOutBuf := abFrameBuf);
	FOR j := 0 TO UINT_TO_INT(uiFrameLen) - 1 DO abSendBuf[j] := abFrameBuf[j]; END_FOR;
	fbWrite(xExecute := TRUE, hConnection := fbConnection.hConnection, szSize := TO_UDINT(uiFrameLen), pData := ADR(abSendBuf));
	IF fbWrite.xDone OR fbWrite.xError THEN
		fbWrite(xExecute := FALSE);
		eStep := E_WS_State.CLOSING;
	END_IF;

E_WS_State.CLOSING:
	fbRead(xEnable := FALSE);
	fbWrite(xExecute := FALSE);
	fbConnection(xEnable := FALSE);
	fbServer(xEnable := FALSE);
	LogComponent.Logger.LogADD(LogClass:= cmplog.LogClass.LOG_INFO, Component:= LogComponent.WS, Message:= 'WS Connection Closed');
	eStep := E_WS_State.IDLE;

E_WS_State.ERROR:
	xRunning := FALSE;
	IF NOT xEnable THEN eStep := E_WS_State.IDLE; END_IF;

END_CASE;

eState := eStep;
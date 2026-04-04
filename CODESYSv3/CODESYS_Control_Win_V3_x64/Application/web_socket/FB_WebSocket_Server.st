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

	sClientKey   : STRING(40);
	sAcceptKey   : STRING(40);
	sResponse    : STRING(255);
	uiResponseLen: UINT;

	abPayloadOut : ARRAY [0..31] OF BYTE;

	i     : INT;
	dwOff : DWORD;
	pByte : POINTER TO BYTE;
	pStr  : POINTER TO BYTE;

	xSendTrigLast : BOOL;
	xEnableLast   : BOOL;
	xSendPending  : BOOL;
	sLogMsg       : STRING(255);
END_VAR

// === IMPLEMENTATION ===
// ALWAYS call maintenance blocks if server is starting or running
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
	fbRead(
		xEnable     := TRUE,
		hConnection := fbConnection.hConnection,
		szSize      := SIZEOF(abRecvBuf),
		pData       := ADR(abRecvBuf)
	);
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
		FOR i := 0 TO UINT_TO_INT(uiResponseLen) - 1 DO
			abSendBuf[i] := pStr[i];
		END_FOR;
		uiSendLen := uiResponseLen;
		eStep := E_WS_State.HANDSHAKE_SEND;
	END_IF;

E_WS_State.HANDSHAKE_SEND:
	fbWrite(
		xExecute    := TRUE,
		hConnection := fbConnection.hConnection,
		szSize      := TO_UDINT(uiSendLen),
		pData       := ADR(abSendBuf)
	);
	IF fbWrite.xDone THEN
		fbWrite(xExecute := FALSE);
		LogComponent.Logger.LogADD(Component:= LogComponent.WS, LogClass:= cmplog.LogClass.LOG_INFO, Message:= 'WS Client Handshake OK');
		eStep := E_WS_State.WS_CONNECTED;
	ELSIF fbWrite.xError THEN
		sError := 'Handshake send failed';
		eStep := E_WS_State.CLOSING;
	END_IF;

E_WS_State.WS_CONNECTED:
	xHandshakeOK := TRUE;
	IF NOT fbConnection.xActive THEN
		sError := 'Connection lost';
		eStep := E_WS_State.CLOSING;
	END_IF;

E_WS_State.WS_SEND_CLOSE:
	uiFrameLen := FC_WS_BuildFrame(
		eOpcode := E_WS_Opcode.CLOSE,
		pPayload := ADR(abFrameBuf), 
		uiPayloadLen := 0,
		xFin := TRUE,
		abOutBuf := abFrameBuf
	);
	
	FOR i := 0 TO UINT_TO_INT(uiFrameLen) - 1 DO
		abSendBuf[i] := abFrameBuf[i];
	END_FOR;
	uiSendLen := uiFrameLen;
	
	fbWrite(
		xExecute := TRUE,
		hConnection := fbConnection.hConnection,
		szSize := TO_UDINT(uiSendLen),
		pData := ADR(abSendBuf)
	);
	IF fbWrite.xDone THEN
		fbWrite(xExecute := FALSE);
		eStep := E_WS_State.CLOSING;
	ELSIF fbWrite.xError THEN
		fbWrite(xExecute := FALSE);
		eStep := E_WS_State.CLOSING; 
	END_IF;

E_WS_State.CLOSING:
	fbRead(xEnable := FALSE);
	fbWrite(xExecute := FALSE);
	fbConnection(xEnable := FALSE);
	fbServer(xEnable := FALSE);
	eStep := E_WS_State.IDLE;

E_WS_State.ERROR:
	xRunning := FALSE;
	IF NOT xEnable THEN
		eStep := E_WS_State.IDLE;
	END_IF;

END_CASE;

// ==================================================
// FULL-DUPLEX DATA EXCHANGE (Runs when connected)
// ==================================================
IF eStep = E_WS_State.WS_CONNECTED THEN
	
	// --- 1. RECEIVER ---
	fbRead(
		xEnable := TRUE,
		hConnection := fbConnection.hConnection,
		szSize := SIZEOF(abRecvBuf),
		pData := ADR(abRecvBuf)
	);
	
	IF fbRead.xReady AND fbRead.szCount > 0 THEN
		uiRecvLen := TO_UINT(fbRead.szCount);
		
		IF FC_WS_ParseFrame(pData := ADR(abRecvBuf), uiDataLen := uiRecvLen, stFrame := stFrame) THEN
			CASE stFrame.eOpcode OF
				E_WS_Opcode.TEXT, E_WS_Opcode.BINARY:
					IF pRecvData <> 0 AND uiRecvSize > 0 THEN
						uiReceivedLen := MIN(UDINT_TO_UINT(stFrame.udiPayloadLen), uiRecvSize);
						FOR i := 0 TO UINT_TO_INT(uiReceivedLen) - 1 DO
							pRecvData[i] := stFrame.abPayload[i];
						END_FOR;
						xNewDataReceived := TRUE;
					END_IF;
					
				E_WS_Opcode.CLOSE:
					sError := 'Client requested close';
					LogComponent.Logger.LogADD(Component:= LogComponent.WS, LogClass:= cmplog.LogClass.LOG_WARNING, Message:= 'WS Client Disconnected');
					eStep := E_WS_State.WS_SEND_CLOSE;
					
				E_WS_Opcode.PING:
					// Handled
			END_CASE;
		END_IF;
	ELSIF fbRead.xError THEN
		sError := 'Read error';
		eStep := E_WS_State.CLOSING;
	END_IF;

	// --- 2. TRANSMITTER ---
	IF xSendPending AND NOT fbWrite.xBusy THEN
		IF pSendData <> 0 AND uiSendSize > 0 THEN
			uiFrameLen := FC_WS_BuildFrame(
				eOpcode := E_WS_Opcode.BINARY,
				pPayload := pSendData,
				uiPayloadLen := uiSendSize,
				xFin := TRUE,
				abOutBuf := abFrameBuf
			);
			
			FOR i := 0 TO UINT_TO_INT(uiFrameLen) - 1 DO
				abSendBuf[i] := abFrameBuf[i];
			END_FOR;
			uiSendLen := uiFrameLen;
			
			fbWrite(xExecute := TRUE, hConnection := fbConnection.hConnection, szSize := TO_UDINT(uiSendLen), pData := ADR(abSendBuf));
			xSendPending := FALSE;
		ELSE
			xSendPending := FALSE; 
		END_IF;
			
	ELSIF fbWrite.xDone OR fbWrite.xError THEN
		fbWrite(xExecute := FALSE);
	ELSE
		fbWrite();
	END_IF;

END_IF;

eState := eStep;
GVL_WebSocket.sDebugInfo := CONCAT('Step: ', TO_STRING(eStep));
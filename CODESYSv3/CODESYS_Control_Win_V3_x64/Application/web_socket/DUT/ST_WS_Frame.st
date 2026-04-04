TYPE ST_WS_Frame :
STRUCT
	xFin          : BOOL;                      // FIN bit
	eOpcode       : E_WS_Opcode;               // Frame opcode
	xMasked       : BOOL;                      // Mask bit
	udiPayloadLen : UDINT;                     // Payload length
	abMaskKey     : ARRAY [0..3] OF BYTE;      // Masking key (from client)
	abPayload     : ARRAY [0..1023] OF BYTE;   // Payload data (max 1KB)
	uiTotalLen    : UINT;                      // Total frame length in bytes
	xValid        : BOOL;                      // Frame parsed successfully
END_STRUCT
END_TYPE
{attribute 'qualified_only'}
{attribute 'strict'}
TYPE E_WS_State : (
	IDLE              := 0,    // Waiting, not started
	SERVER_STARTING   := 10,   // TCP_Server enabling
	SERVER_LISTENING  := 20,   // Server ready, waiting for connection
	CONN_WAITING      := 30,   // TCP_Connection enabled, waiting for client
	CONN_ACCEPTED     := 40,   // Client connected, waiting for handshake
	HANDSHAKE_READ    := 50,   // Reading HTTP upgrade request
	HANDSHAKE_PARSE   := 60,   // Parsing handshake, computing accept key
	HANDSHAKE_SEND    := 70,   // Sending HTTP 101 response
	HANDSHAKE_DONE    := 80,   // Handshake complete
	WS_CONNECTED      := 100,  // WebSocket link active - reading frames
	WS_PROCESS_FRAME  := 110,  // Processing a received frame
	WS_SEND_PONG      := 120,  // Sending pong response to ping
	WS_SEND_CLOSE     := 130,  // Sending close frame
	WS_SEND_DATA      := 140,  // Sending data frame to client
	CLOSING           := 200,  // Closing connection
	ERROR             := 255   // Error state
)UINT;
END_TYPE
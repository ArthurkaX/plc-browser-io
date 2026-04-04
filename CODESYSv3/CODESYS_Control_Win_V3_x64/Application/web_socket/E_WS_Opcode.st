{attribute 'qualified_only'}
{attribute 'strict'}
TYPE E_WS_Opcode : (
	CONTINUATION  := 16#00,
	TEXT          := 16#01,
	BINARY        := 16#02,
	CLOSE         := 16#08,
	PING          := 16#09,
	PONG          := 16#0A
)BYTE;
END_TYPE
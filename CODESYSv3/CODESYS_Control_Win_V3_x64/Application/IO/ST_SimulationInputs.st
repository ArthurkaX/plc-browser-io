TYPE ST_SimulationInputs :
STRUCT
	uiWatchdog_Inputs : BYTE; // Offset: 0
    _spare_byte_1 : BYTE;
    _spare_byte_2 : BYTE;
    _spare_byte_3 : BYTE;
    rSpeedSetpoint : REAL; // Offset: 4
    diEncoderRaw : DINT; // Offset: 8
    iTargetPosition : INT; // Offset: 12
    uiCycleCount : UINT; // Offset: 14
    xStart : BIT; // Offset: 16.0
    xModeAuto : BIT; // Offset: 16.1
    _spare_b16_bit2 : BIT;
    _spare_b16_bit3 : BIT;
    _spare_b16_bit4 : BIT;
    _spare_b16_bit5 : BIT;
    _spare_b16_bit6 : BIT;
    _spare_b16_bit7 : BIT;
    byStatusBits : BYTE; // Offset: 17
    sProductName : STRING(20); // Offset: 18
END_STRUCT
END_TYPE
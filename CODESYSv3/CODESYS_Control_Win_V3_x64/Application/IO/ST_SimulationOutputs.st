TYPE ST_SimulationOutputs :
STRUCT
	uiWatchdog_Outputs : BYTE; // Offset: 0
    _spare_byte_1 : BYTE;
    _spare_byte_2 : BYTE;
    _spare_byte_3 : BYTE;
    rActualSpeed : REAL; // Offset: 4
    diEncoderFeedback : DINT; // Offset: 8
    iActualPosition : INT; // Offset: 12
    uiErrorID : UINT; // Offset: 14
    xLightWarning : BIT; // Offset: 16.0
    xMotorRunning : BIT; // Offset: 16.1
    _spare_b16_bit2 : BIT;
    _spare_b16_bit3 : BIT;
    _spare_b16_bit4 : BIT;
    _spare_b16_bit5 : BIT;
    _spare_b16_bit6 : BIT;
    _spare_b16_bit7 : BIT;
    byErrorCode : BYTE; // Offset: 17
    sLogMessage : STRING(40); // Offset: 18
END_STRUCT
END_TYPE
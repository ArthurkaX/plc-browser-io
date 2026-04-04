const addressInput = document.getElementById('ws-address');
const connectBtn = document.getElementById('connect-btn');
const disconnectBtn = document.getElementById('disconnect-btn');
const dataInput = document.getElementById('data-to-send');
const sendBtn = document.getElementById('send-btn');
const charCount = document.getElementById('char-count');

const strInDisplay = document.getElementById('str-in');
const statusWrapper = document.getElementById('connection-status');
const statusText = statusWrapper.querySelector('.status-text');
const logsContainer = document.getElementById('logs');

let socket = null;
let intervalId = null;

const SYNC_INTERVAL = 100; // 100ms payload sync
const PACKET_SIZE = 20; // Exactly 20 bytes

function updateStatus(state) {
    statusWrapper.className = 'status-indicator ' + state;
    switch(state) {
        case 'connected':
            statusText.innerText = 'Connected';
            connectBtn.style.display = 'none';
            disconnectBtn.style.display = 'inline-block';
            break;
        case 'disconnected':
            statusText.innerText = 'Disconnected';
            connectBtn.style.display = 'inline-block';
            disconnectBtn.style.display = 'none';
            break;
        case 'connecting':
            statusText.innerText = 'Connecting...';
            // Disable both while connecting to avoid multiple attempts
            connectBtn.style.display = 'none';
            disconnectBtn.style.display = 'none';
            break;
    }
}

function stringToByteArray(str, length) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    const result = new Uint8Array(length); // Initialized with 0
    result.set(bytes.slice(0, length));
    return result;
}

function byteArrayToHex(arr) {
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

function logToConsole(type, message) {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    const prefix = type === 'sent' ? '->' : type === 'received' ? '<-' : `[${type.toUpperCase()}]`;
    entry.innerText = `[${new Date().toLocaleTimeString('en-US', { hour12: false, fractionalSecondDigits: 3 })}] ${prefix} ${message}`;
    logsContainer.prepend(entry);
    console.log(`[WS ${type}]`, message);
    
    // Limit logs to last 100 entries
    if (logsContainer.children.length > 100) {
        logsContainer.removeChild(logsContainer.lastChild);
    }
}

function sendPayload() {
    if (socket && socket.readyState === WebSocket.OPEN) {
        const rawText = dataInput.value || "";
        // Pad or truncate to exactly 20 characters
        const paddedString = rawText.padEnd(PACKET_SIZE, ' ').substring(0, PACKET_SIZE);
        
        // Send as text
        socket.send(paddedString);
        
        // Update UI for outgoing packet
        logToConsole('sent', `"${paddedString}"`);
    } else {
        alert('Please connect to the server first!');
    }
}

function stringToHex(str) {
    return Array.from(new TextEncoder().encode(str))
        .map(b => b.toString(16).padStart(2, '0').toUpperCase())
        .join(' ');
}

function startTransmission() {
    // Temporarily disabled 100ms auto-broadcast
    // startInterval(); 
}

function stopTransmission() {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }
}

sendBtn.addEventListener('click', sendPayload);

connectBtn.addEventListener('click', () => {
    const url = addressInput.value.trim();
    if (!url) return alert('Please enter an address!');

    updateStatus('connecting');

    try {
        socket = new WebSocket(url);
        socket.binaryType = 'arraybuffer'; // We exchange binary packets (20 bytes)

        socket.onopen = (event) => {
            logToConsole('info', `✅ Connection opened: ${url}`);
            updateStatus('connected');
            startTransmission();
        };

        socket.onmessage = async (event) => {
            let text;
            if (typeof event.data === 'string') {
                text = event.data;
                logToConsole('info', `Data type: string, length: ${text.length}`);
            } else {
                // If it came as binary, decode it
                const buffer = (event.data instanceof Blob) ? await event.data.arrayBuffer() : event.data;
                text = new TextDecoder().decode(buffer);
                logToConsole('info', `Data type: binary, bytes: ${buffer.byteLength}`);
            }

            // Exactly 20 chars
            const fixedText = text.substring(0, PACKET_SIZE).padEnd(PACKET_SIZE, ' ');
            
            // Update UI
            strInDisplay.innerText = fixedText;
            logToConsole('received', `"${fixedText}"`);
        };

        socket.onclose = (event) => {
            const reason = event.reason || '(no reason)';
            logToConsole('warn', `🔌 Connection closed | code=${event.code} | wasClean=${event.wasClean} | reason="${reason}"`);
            // WebSocket close codes reference
            const codeDesc = {
                1000: 'Normal closure',
                1001: 'Going away',
                1002: 'Protocol error',
                1003: 'Unsupported data',
                1005: 'No status received (reserved)',
                1006: 'Abnormal closure (no close frame — TCP drop)',
                1007: 'Invalid data',
                1008: 'Policy violation',
                1009: 'Message too big',
                1010: 'Mandatory extension',
                1011: 'Internal server error',
                1012: 'Service restart',
                1013: 'Try again later',
                1015: 'TLS handshake error (reserved)',
            };
            logToConsole('warn', `Code ${event.code}: ${codeDesc[event.code] || 'Unknown'}`);
            updateStatus('disconnected');
            stopTransmission();
            socket = null;
        };

        socket.onerror = (error) => {
            logToConsole('error', `❌ WebSocket error — see DevTools Network → WS for server response headers`);
            console.error('WS Error detail:', error);
            updateStatus('disconnected');
            stopTransmission();
            socket = null;
        };

    } catch (e) {
        console.error('Exception during connection', e);
        updateStatus('disconnected');
        alert('Incorrect address or network error.');
    }
});

disconnectBtn.addEventListener('click', () => {
    if (socket) {
        logToConsole('info', 'Disconnection request...');
        socket.close();
    }
});

dataInput.addEventListener('input', () => {
    const val = dataInput.value;
    charCount.innerText = val.length;
});

dataInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendPayload();
    }
});

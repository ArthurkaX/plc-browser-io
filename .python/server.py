import asyncio
import websockets
import sys
import os

# Configuration
HOST = "localhost"
PORT = 8080
PACKET_SIZE = 20

# Tracking state
last_received_data = None
clients = set()

def fixed_string_to_hex(text):
    return text.encode('utf-8').hex(' ').upper()

async def console_input_handler():
    """Reads input from the console and broadcasts it to all connected clients."""
    loop = asyncio.get_event_loop()
    print(f"[*] Для отправки данных на страницу введите текст (до {PACKET_SIZE} символов) и нажмите Enter:")
    
    while True:
        # Non-blocking read from stdin
        text = await loop.run_in_executor(None, sys.stdin.readline)
        text = text.strip()
        
        if not text:
            continue

        # Prepare 20-character string (padded with spaces)
        fixed_string = text.ljust(PACKET_SIZE, ' ')[:PACKET_SIZE]
        hex_view = fixed_string.encode('utf-8').hex(' ').upper()
        
        if clients:
            print(f"[->] Рассылка {len(clients)} клиентам: '{fixed_string}' (HEX: {hex_view})")
            # Broadcast as TEXT
            tasks = [asyncio.create_task(client.send(fixed_string)) for client in clients]
            if tasks:
                await asyncio.wait(tasks)
        else:
            print("[!] Ошибка: Нет активных подключений для отправки.")

async def socket_handler(websocket):
    """Handles individual WebSocket client connections."""
    global last_received_data
    
    # Register client
    clients.add(websocket)
    addr = websocket.remote_address
    print(f"[+] Новое соединение: {addr}")
    
    try:
        async for message in websocket:
            # Prototype now sends 20-character text strings
            if isinstance(message, bytes):
                try:
                    text = message.decode('utf-8')
                except UnicodeDecodeError:
                    text = "(binary data)"
            else:
                text = message

            # Exactly 20 chars
            fixed_text = text.ljust(PACKET_SIZE, ' ')[:PACKET_SIZE]
            
            if fixed_text != last_received_data:
                last_received_data = fixed_text
                
                # Format for display
                hex_view = fixed_string_to_hex(fixed_text)
                print(f"[<-] Данные изменились: '{fixed_text}' (HEX: {hex_view})")
            
    except websockets.exceptions.ConnectionClosed:
        print(f"[-] Соединение закрыто: {addr}")
    finally:
        # Unregister client
        clients.remove(websocket)

async def main():
    print(f"[*] Запуск сервера на ws://{HOST}:{PORT}...")
    
    # Start the websocket server
    async with websockets.serve(socket_handler, HOST, PORT):
        # Run console input handler concurrently
        input_task = asyncio.create_task(console_input_handler())
        
        # Keep the server running
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[*] Сервер остановлен пользователем.")
    except Exception as e:
        print(f"[!] Критическая ошибка: {e}")
        if "websockets" in str(e):
            print("\n>>> ПОДСКАЗКА: Вам нужно установить библиотеку 'websockets':")
            print(">>> pip install websockets")

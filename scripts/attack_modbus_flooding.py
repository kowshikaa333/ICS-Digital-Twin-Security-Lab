from pymodbus.client import ModbusTcpClient
import time, datetime

HOST = 'localhost'
PORT = 5021
UNIT = 1
DURATION = 65  # slightly longer than the timing script, to fully cover it

client = ModbusTcpClient(HOST, port=PORT)
client.connect()

t_start = datetime.datetime.utcnow().isoformat()
print(f"=== MODBUS FLOODING START: {t_start} ===")

count = 0
end_time = time.time() + DURATION
while time.time() < end_time:
    try:
        client.read_holding_registers(0, count=1, device_id=UNIT)
        count += 1
    except Exception:
        pass

t_end = datetime.datetime.utcnow().isoformat()
print(f"=== MODBUS FLOODING END: {t_end} ===")
print(f"Total requests sent: {count}  ({count/DURATION:.1f} req/sec)")
client.close()

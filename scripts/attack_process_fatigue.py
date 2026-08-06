from pymodbus.client import ModbusTcpClient
import time, datetime, csv

HOST = 'localhost'
PORT = 5021
UNIT = 1
DURATION = 60       # seconds
TOGGLE_INTERVAL = 0.3  # alternate every 300ms

client = ModbusTcpClient(HOST, port=PORT)
client.connect()

log = []
toggle_count = 0
t_start = datetime.datetime.utcnow().isoformat()
print(f"=== PROCESS FATIGUE START: {t_start} ===")
print("Alternating CmdPompeManu (9) / CmdVidangeManu (10) every 300ms")

end_time = time.time() + DURATION
pump_turn = True

levels = []

while time.time() < end_time:
    if pump_turn:
        client.write_coil(9, True, device_id=UNIT)
        client.write_coil(10, False, device_id=UNIT)
    else:
        client.write_coil(9, False, device_id=UNIT)
        client.write_coil(10, True, device_id=UNIT)
    pump_turn = not pump_turn
    toggle_count += 1

    reg = client.read_holding_registers(0, count=1, device_id=UNIT)
    level = reg.registers[0]
    levels.append(level)
    ts = datetime.datetime.utcnow().isoformat()
    log.append((ts, pump_turn, level))

    time.sleep(TOGGLE_INTERVAL)

t_end = datetime.datetime.utcnow().isoformat()
print(f"=== PROCESS FATIGUE END: {t_end} ===")
print(f"Total toggles: {toggle_count}")
print(f"Toggle frequency: {toggle_count/DURATION:.2f} Hz")
print(f"Level mean: {sum(levels)/len(levels):.2f}  min: {min(levels)}  max: {max(levels)}")

with open('attack_process_fatigue_log.csv', 'w', newline='') as f:
    w = csv.writer(f)
    w.writerow(['timestamp','pump_turn','level'])
    w.writerows(log)

client.close()

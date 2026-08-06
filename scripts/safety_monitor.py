from pymodbus.client import ModbusTcpClient
import time, datetime, csv, sys

HOST = 'localhost'
PORT = 5021
UNIT = 1
THRESHOLD_HIGH = 90
THRESHOLD_LOW = 15
POLL_INTERVAL = 0.2

client = ModbusTcpClient(HOST, port=PORT)
client.connect()

log_file = open('safety_monitor_log.csv', 'a', newline='')
writer = csv.writer(log_file)

alert_count = 0
poll_count = 0
error_count = 0

print(f"=== SAFETY MONITOR START: {datetime.datetime.utcnow().isoformat()} ===")

start_time = time.time()
duration = float(sys.argv[1]) if len(sys.argv) > 1 else 60

try:
    while time.time() - start_time < duration:
        t0 = time.perf_counter()
        try:
            r = client.read_holding_registers(0, count=1, device_id=UNIT)
            level = r.registers[0]
            latency = (time.perf_counter() - t0) * 1000
            poll_count += 1

            if level >= THRESHOLD_HIGH or level <= THRESHOLD_LOW:
                ts = datetime.datetime.utcnow().isoformat()
                writer.writerow([ts, level, latency, 'ALERT'])
                log_file.flush()
                alert_count += 1
                print(f"[ALERT] {ts} level={level} latency={latency:.2f}ms")
        except Exception as e:
            error_count += 1
            print(f"poll error: {e}")

        time.sleep(POLL_INTERVAL)
except KeyboardInterrupt:
    pass

print(f"=== SAFETY MONITOR END: {datetime.datetime.utcnow().isoformat()} ===")
print(f"Total polls: {poll_count}, Alerts logged: {alert_count}, Errors: {error_count}")

log_file.close()
client.close()

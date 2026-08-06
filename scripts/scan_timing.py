import time, csv, statistics
from pymodbus.client import ModbusTcpClient

client = ModbusTcpClient('localhost', port=5021)
client.connect()
samples = []
for i in range(6000):
    t0 = time.perf_counter()
    client.read_holding_registers(0, count=1, device_id=1)
    samples.append((time.perf_counter() - t0) * 1000)
    time.sleep(0.1)

with open('baseline_scan_timing_openplc1.csv','w') as f:
    w = csv.writer(f)
    w.writerow(['round_trip_ms'])
    for s in samples:
        w.writerow([s])

print(f"mean={statistics.mean(samples):.3f}ms stdev={statistics.stdev(samples):.3f}ms")

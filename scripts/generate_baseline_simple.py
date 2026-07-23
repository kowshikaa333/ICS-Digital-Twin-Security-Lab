from pymodbus.client import ModbusTcpClient
import time

print("=== Génération Baseline Simple - Cuve Pompe ===")

client = ModbusTcpClient("127.0.0.1", port=5021)
if not client.connect():
    print("Erreur connexion")
    exit(1)

for i in range(10):
    # ON
    client.write_coil(0, True, device_id=1)
    print(f"[{i+1}/10] ON envoyé")
    time.sleep(3)

    # OFF
    client.write_coil(0, False, device_id=1)
    print(f"[{i+1}/10] OFF envoyé")
    time.sleep(3)

print("Baseline terminée")
client.close()

from pymodbus.client import ModbusTcpClient
import time

PLC_IP = "192.168.6.156"
PLC_PORT = 5021

client = ModbusTcpClient(PLC_IP, port=PLC_PORT)
if not client.connect():
    print("❌ Erreur de connexion au PLC")
    exit(1)

print("Début de la génération de baseline réaliste (ON/OFF Pompe)...\n")

for i in range(8):   # 8 cycles ON/OFF
    # Pompe ON
    response = client.write_coil(address=0, value=True, device_id=1)
    print(f"[{i+1}/8] Pompe ON envoyée")
    time.sleep(4)

    # Pompe OFF
    response = client.write_coil(address=0, value=False, device_id=1)
    print(f"[{i+1}/8] Pompe OFF envoyée")
    time.sleep(4)

print("\n✅ Baseline terminée.")
client.close()

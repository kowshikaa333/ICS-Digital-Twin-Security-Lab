from pymodbus.client import ModbusTcpClient
import time

HOST = "192.168.6.156"
PORT = 5021
UNIT = 1

# Coils de commande HMI connus
CMD_MODE_AUTO = 8
CMD_POMPE_MANU = 9
CMD_VIDANGE_MANU = 10
CMD_RESET_NIVEAU = 11

client = ModbusTcpClient(HOST, port=PORT)

if not client.connect():
    print("Impossible de se connecter à OpenPLC")
    exit(1)

print("=== RESET COMMANDES CUVE ===")

for coil in [CMD_POMPE_MANU, CMD_VIDANGE_MANU, CMD_MODE_AUTO, CMD_RESET_NIVEAU]:
    print(f"Coil {coil} -> OFF")
    client.write_coil(coil, False, device_id=UNIT)
    time.sleep(0.5)

client.close()
print("Reset terminé.")

from pymodbus.client import ModbusTcpClient
import time

HOST = "192.168.6.156"
PORT = 5021
UNIT = 1

CMD_MODE_AUTO = 8
CMD_POMPE_MANU = 9
CMD_VIDANGE_MANU = 10
CMD_RESET_NIVEAU = 11

client = ModbusTcpClient(HOST, port=PORT)

if not client.connect():
    print("Impossible de se connecter à OpenPLC")
    exit(1)

print("=== PREPARATION BASELINE NORMALE ===")

print("Cmd Pompe Manu -> OFF")
client.write_coil(CMD_POMPE_MANU, False, device_id=UNIT)
time.sleep(0.5)

print("Cmd Vanne Vidange -> OFF")
client.write_coil(CMD_VIDANGE_MANU, False, device_id=UNIT)
time.sleep(0.5)

print("Cmd Reset Niveau -> OFF")
client.write_coil(CMD_RESET_NIVEAU, False, device_id=UNIT)
time.sleep(0.5)

print("Cmd Mode Auto -> ON")
client.write_coil(CMD_MODE_AUTO, True, device_id=UNIT)
time.sleep(0.5)

client.close()

print("Baseline normale préparée.")
print("Attendu HMI : Mode Auto ON, Pompe OFF, Vanne OFF.")

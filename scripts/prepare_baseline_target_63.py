from pymodbus.client import ModbusTcpClient
import time

HOST = "192.168.6.156"
PORT = 5021
UNIT = 1

# Coils de commande HMI
CMD_MODE_AUTO = 8
CMD_POMPE_MANU = 9
CMD_VIDANGE_MANU = 10
CMD_RESET_NIVEAU = 11

# Registre niveau %QW0
REG_NIVEAU = 0

TARGET = 63
TOLERANCE = 1
MAX_SECONDS = 180

client = ModbusTcpClient(HOST, port=PORT)

if not client.connect():
    print("Impossible de se connecter à OpenPLC")
    exit(1)

def write_coil(addr, value):
    r = client.write_coil(addr, value, device_id=UNIT)
    if r.isError():
        print(f"Erreur écriture coil {addr} = {value}")
    else:
        print(f"Coil {addr} -> {value}")

def read_niveau():
    r = client.read_holding_registers(REG_NIVEAU, count=1, device_id=UNIT)
    if r.isError():
        print("Erreur lecture niveau")
        return None

    niveau = int(r.registers[0])

    if niveau < 0:
        niveau = 0
    if niveau > 100:
        niveau = 100

    return niveau

print("=== PREPARATION BASELINE NORMALE CIBLE 63% ===")

# 1. Passer en manuel pour contrôler le niveau
print("\nPassage en manuel")
write_coil(CMD_MODE_AUTO, False)
time.sleep(0.5)

# 2. Nettoyage commandes
write_coil(CMD_POMPE_MANU, False)
write_coil(CMD_VIDANGE_MANU, False)
write_coil(CMD_RESET_NIVEAU, False)
time.sleep(1)

start = time.time()

while True:
    niveau = read_niveau()

    if niveau is None:
        break

    print(f"Niveau actuel = {niveau}%")

    if abs(niveau - TARGET) <= TOLERANCE:
        print("Niveau cible atteint.")
        break

    if time.time() - start > MAX_SECONDS:
        print("Temps maximum atteint.")
        break

    if niveau < TARGET - TOLERANCE:
        print("Niveau trop bas -> pompe ON")
        write_coil(CMD_VIDANGE_MANU, False)
        write_coil(CMD_POMPE_MANU, True)

    elif niveau > TARGET + TOLERANCE:
        print("Niveau trop haut -> vidange ON")
        write_coil(CMD_POMPE_MANU, False)
        write_coil(CMD_VIDANGE_MANU, True)

    time.sleep(1)

# 3. Arrêt actionneurs
print("\nArrêt pompe et vidange")
write_coil(CMD_POMPE_MANU, False)
write_coil(CMD_VIDANGE_MANU, False)
time.sleep(1)

# 4. Retour mode auto ON
print("Retour Mode Auto ON")
write_coil(CMD_MODE_AUTO, True)
time.sleep(1)

niveau_final = read_niveau()
print(f"\nNiveau final = {niveau_final}%")
print("Attendu HMI : Mode Auto ON, Pompe OFF, Vanne OFF, niveau proche de 63%.")

client.close()

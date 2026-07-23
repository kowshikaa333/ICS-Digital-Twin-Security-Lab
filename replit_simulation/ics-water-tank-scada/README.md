# ICS Water Tank SCADA — Standalone

Self-contained Node.js server: runs the full SCADA platform locally with no cloud dependency.

## Requirements
- Node.js ≥ 18  →  https://nodejs.org

## Quick start

```bash
cd ics-water-tank-scada
npm install
node server.js
```

Then open **http://localhost:3000** in your browser.

> **Tip (non-root / Windows):** Modbus TCP defaults to port 502 (requires root/admin on Linux/macOS).
> To use port 5020 instead:
> ```bash
> MODBUS_PORT=5020 node server.js
> ```

## Services

| Service       | Address                        | Protocol      |
|---------------|--------------------------------|---------------|
| Browser UI    | http://localhost:3000          | HTTP          |
| REST API      | http://localhost:3000/api/tank | HTTP/JSON     |
| WebSocket     | ws://localhost:3000/api/tank/ws| WS            |
| MQTT (WS)     | ws://localhost:3000/mqtt       | MQTT over WS  |
| MQTT (TCP)    | localhost:1883                 | MQTT TCP      |
| Modbus TCP    | localhost:502 (or 5020)        | Modbus TCP    |

## REST API

```
GET  /api/tank/status         full PLC state
POST /api/tank/command        { "action": "auto_mode", "value": true }
GET  /api/tank/registers      Modbus register dump
GET  /api/tank/history        last 100 data points
GET  /api/tank/config         connection info
```

## Modbus register map (Unit ID 1)

**Coils (FC01 read / FC05 write):**

| Address | Name            | R/W |
|---------|-----------------|-----|
| 0       | fillPump        | R   |
| 1       | drainValve      | R   |
| 2       | alarmLowLevel   | R   |
| 3       | alarmHighLevel  | R   |
| 4       | autoModeOutput  | R   |
| 8       | cmdAutoMode     | R/W |
| 9       | cmdPumpManual   | R/W |
| 10      | cmdDrainManual  | R/W |
| 11      | cmdLevelReset   | R/W |
| 12      | cmdEStop        | W   |

**Holding registers (FC03 read / FC06 write):**

| Address | Name         | Unit | Scale   | R/W |
|---------|--------------|------|---------|-----|
| 0       | tankLevel    | %    | raw÷100 | R   |
| 1       | setpoint     | %    | raw÷100 | R/W |
| 2       | deadBand     | %    | raw÷100 | R/W |
| 3       | pressure     | bar  | raw÷1000| R   |
| 4       | temperature  | °C   | raw÷10  | R   |

## VMware bridge files

The `public/bridge/` folder contains integration files for:
- **Node-RED** (`node-red-flow.json`)
- **Ignition SCADA** (`ignition-tags.json`)
- **Eclipse Ditto** (`eclipse-ditto-thing.json`)
- **SQL Server** (`sqlserver-schema.sql`)
- **Kibana** (`kibana-index.ndjson`)
- **OpenPLC** (`openplc-modbus-map.csv`)
- Full instructions in `README.txt`

## Connect with OpenPLC / Ignition / Node-RED

Point them to `localhost:502` (Modbus TCP, Unit ID 1) — no bridge script needed when running locally.

For MQTT: connect any MQTT client (MQTT Explorer, Node-RED, mosquitto_sub) to `localhost:1883`.

---
IEC 61131-3 ST program: CuveRegulationAvancee | English variable names throughout

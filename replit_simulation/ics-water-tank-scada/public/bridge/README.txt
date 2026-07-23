===================================================================
 ICS Water Tank SCADA — VMware Bridge & Integration Files
 TK-001 / CuveRegulationAvancee (IEC 61131-3 ST)
===================================================================

CONTENTS
--------
gateway.js               Node.js bridge — run this in VMware
package.json             Node.js dependencies for gateway
node-red-flow.json       Import into Node-RED (ready-to-use flow)
eclipse-ditto-thing.json Eclipse Ditto digital twin definition
sqlserver-schema.sql     SQL Server database schema (TankSCADA)
kibana-index.ndjson      Kibana index pattern + dashboard import
ignition-tags.json       Ignition SCADA tag import
openplc-modbus-map.csv   OpenPLC Modbus I/O mapping


STEP 1 — GET YOUR REPLIT SERVER URL
-------------------------------------
Open your app's /api/tank/config endpoint to find all URLs:
  https://YOUR-APP.replit.app/api/tank/config

You need:
  WebSocket:  wss://YOUR-APP.replit.app/api/tank/ws
  REST:       https://YOUR-APP.replit.app/api/tank/status
  MQTT (WS):  wss://YOUR-APP.replit.app/api/mqtt


STEP 2 — RUN THE GATEWAY IN VMWARE
-------------------------------------
# Prerequisites: Node.js >= 18 installed in VMware

cd bridge/
npm install
SCADA_WS_URL="wss://YOUR-APP.replit.app/api/tank/ws" node gateway.js

# Optional: configure additional integrations
SCADA_WS_URL="wss://..." \
MSSQL_SERVER="localhost" \
MSSQL_USER="sa" \
MSSQL_PASSWORD="YourPass!" \
MSSQL_DATABASE="TankSCADA" \
ES_URL="http://localhost:9200" \
node gateway.js


STEP 3 — CONNECT YOUR TOOLS
-------------------------------------

>> OpenPLC
  - Open OpenPLC Runtime → Slave Devices → Add Modbus TCP Slave
  - Host: localhost (in VMware), Port: 502, Unit ID: 1
  - Map registers using openplc-modbus-map.csv

>> Ignition SCADA
  - Device → New Device → Modbus TCP
  - Hostname: localhost, Port: 502, Unit ID: 1
  - Import tags: File → Import Tags → ignition-tags.json

>> Node-RED
  - Menu → Import → Clipboard → paste node-red-flow.json
  - MQTT broker: localhost:1883 (gateway must be running)
  - Also works via direct MQTT-WS: wss://YOUR-APP.replit.app/api/mqtt

>> Eclipse Ditto
  - Import eclipse-ditto-thing.json as your Thing definition
  - Set MQTT source: localhost:1883, topic: tank/telemetry
  - Payload mapping script is embedded in the JSON file

>> SQL Server
  - Run sqlserver-schema.sql on your SQL Server instance
  - Gateway auto-creates the table and inserts every 5 seconds
  - Includes stored procedures and Kibana-ready hourly view

>> Kibana / Elasticsearch
  - Start Elasticsearch + Kibana locally
  - Set ES_URL=http://localhost:9200 in gateway env
  - Import Kibana objects: Stack Management → Saved Objects → Import → kibana-index.ndjson
  - Index: tank-readings  (time field: @timestamp)


REGISTER MAP (Modbus TCP, Unit ID 1)
-------------------------------------
COILS (FC01 read / FC05 write):
  0  fillPump         R
  1  drainValve       R
  2  alarmLowLevel    R
  3  alarmHighLevel   R
  4  autoModeOutput   R
  8  cmdAutoMode      R/W  (coil 8)
  9  cmdPumpManual    R/W  (coil 9)
  10 cmdDrainManual   R/W  (coil 10)
  11 cmdLevelReset    R/W  (coil 11)
  12 cmdEStop         W    (coil 12)

HOLDING REGISTERS (FC03 read / FC06 write):
  0  tankLevel    R     raw = % × 100  (e.g. 5300 = 53.00%)
  1  setpoint     R/W   raw = % × 100
  2  deadBand     R/W   raw = % × 100
  3  pressure     R     raw = bar × 1000 (mbar)
  4  temperature  R     raw = °C × 10


MQTT TOPICS
-------------------------------------
Subscriptions (server publishes, you read):
  tank/sensors/level          float  0-100
  tank/sensors/pressure       float  bar
  tank/sensors/temperature    float  °C
  tank/alarms/low             true|false
  tank/alarms/high            true|false
  tank/status/pump            true|false
  tank/status/valve           true|false
  tank/status/mode            auto|manual
  tank/status/interlocks      JSON
  tank/telemetry              JSON (full snapshot)

Publications (you write to control):
  tank/commands/auto_mode     true|false
  tank/commands/pump_manual   true|false
  tank/commands/drain_manual  true|false
  tank/commands/reset         any
  tank/commands/setpoint      float (e.g. "65.0")
  tank/commands/dead_band     float
  tank/commands/estop         any


REST API
-------------------------------------
GET  /api/tank/status       → full PLC state JSON
POST /api/tank/command      → { "action": "auto_mode", "value": true }
GET  /api/tank/registers    → Modbus register dump
GET  /api/tank/history      → last 100 data points
GET  /api/tank/config       → all connection info

===================================================================

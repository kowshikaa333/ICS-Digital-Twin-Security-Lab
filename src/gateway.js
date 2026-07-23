#!/usr/bin/env node
/**
 * ICS Water Tank Gateway — VMware Bridge
 * ========================================
 * Runs in your VMware environment. Connects to the Replit SCADA server
 * and exposes local endpoints for all industrial protocols.
 *
 * Provides:
 *   - Modbus TCP server     → 0.0.0.0:502   (OpenPLC, Ignition, Node-RED)
 *   - MQTT broker/forwarder → 0.0.0.0:1883  (Node-RED, Eclipse Ditto, Mosquitto bridge)
 *   - REST proxy            → 0.0.0.0:8080  (Ignition HTTP, custom clients)
 *   - Elasticsearch pusher  → configurable  (Kibana)
 *   - SQL Server logger     → configurable  (SQL Server / MSSQL)
 *
 * Usage:
 *   npm install
 *   node gateway.js
 *
 * Environment variables:
 *   SCADA_WS_URL      WebSocket URL of the Replit server  (required)
 *   MQTT_HOST         Local MQTT broker host (default: 0.0.0.0)
 *   MQTT_PORT         Local MQTT broker port (default: 1883)
 *   MODBUS_PORT       Local Modbus TCP port  (default: 502)
 *   HTTP_PORT         Local REST proxy port  (default: 8080)
 *   ES_URL            Elasticsearch URL      (optional, e.g. http://localhost:9200)
 *   ES_INDEX          Elasticsearch index    (default: tank-readings)
 *   MSSQL_SERVER      SQL Server host        (optional)
 *   MSSQL_USER        SQL Server user        (optional)
 *   MSSQL_PASSWORD    SQL Server password    (optional)
 *   MSSQL_DATABASE    SQL Server database    (optional, default: TankSCADA)
 *   LOG_INTERVAL_MS   How often to log to DB/ES (default: 5000)
 */

'use strict';

const net     = require('net');
const http    = require('http');
const https   = require('https');
const WebSocket = require('ws');
const aedes   = require('aedes')();
const mqttNet = require('net').createServer(aedes.handle);

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  scadaWsUrl:   process.env.SCADA_WS_URL   || 'wss://YOUR-REPLIT-DOMAIN.replit.app/api/tank/ws',
  scadaRestUrl: process.env.SCADA_REST_URL || 'https://YOUR-REPLIT-DOMAIN.replit.app/api/tank',
  modbusPort:   parseInt(process.env.MODBUS_PORT   || '502'),
  mqttPort:     parseInt(process.env.MQTT_PORT     || '1883'),
  httpPort:     parseInt(process.env.HTTP_PORT     || '8080'),
  esUrl:        process.env.ES_URL         || '',
  esIndex:      process.env.ES_INDEX       || 'tank-readings',
  mssqlServer:  process.env.MSSQL_SERVER   || '',
  mssqlUser:    process.env.MSSQL_USER     || '',
  mssqlPassword:process.env.MSSQL_PASSWORD || '',
  mssqlDatabase:process.env.MSSQL_DATABASE || 'TankSCADA',
  logInterval:  parseInt(process.env.LOG_INTERVAL_MS || '5000'),
};

// ── Shared state (synced from Replit via WebSocket) ──────────────────────────
let state = {
  fillPump: false, drainValve: false,
  alarmLowLevel: false, alarmHighLevel: false,
  autoModeOutput: false,
  cmdAutoMode: false, cmdPumpManual: false, cmdDrainManual: false,
  cmdLevelReset: false,
  tankLevel: 0, setpoint: 60, deadBand: 3,
  pressure: 0, temperature: 18,
  interlockHighHigh: false, interlockLowLow: false, interlockDualCommand: false,
  autoModeActive: false, scanCount: 0, ts: new Date().toISOString(),
};

let ws = null;
let mssqlPool = null;

// ── WebSocket connection to Replit ────────────────────────────────────────────
function connectScada() {
  console.log(`[WS] Connecting to SCADA server: ${CFG.scadaWsUrl}`);
  ws = new WebSocket(CFG.scadaWsUrl, { rejectUnauthorized: false });

  ws.on('open',  () => console.log('[WS] Connected to SCADA server'));
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'state') {
        state = { ...state, ...msg.payload };
        publishMqtt(state);
      }
    } catch { /* ignore */ }
  });

  ws.on('close', () => {
    console.log('[WS] Disconnected — reconnecting in 3s');
    setTimeout(connectScada, 3000);
  });

  ws.on('error', (e) => console.error('[WS] Error:', e.message));
}

function sendCommand(action, value) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'command', action, value }));
  }
}

// ── MQTT Publisher/Broker ─────────────────────────────────────────────────────
function mqttPub(topic, payload) {
  aedes.publish({
    topic, payload: Buffer.from(String(payload)),
    qos: 0, retain: true, dup: false, cmd: 'publish',
  }, () => {});
}

function publishMqtt(s) {
  mqttPub('tank/sensors/level',       s.tankLevel.toFixed(2));
  mqttPub('tank/sensors/pressure',    s.pressure.toFixed(4));
  mqttPub('tank/sensors/temperature', s.temperature.toFixed(2));
  mqttPub('tank/alarms/low',          String(s.alarmLowLevel));
  mqttPub('tank/alarms/high',         String(s.alarmHighLevel));
  mqttPub('tank/status/pump',         String(s.fillPump));
  mqttPub('tank/status/valve',        String(s.drainValve));
  mqttPub('tank/status/mode',         s.autoModeActive ? 'auto' : 'manual');
  mqttPub('tank/telemetry',           JSON.stringify({
    ts: s.ts, level: s.tankLevel, setpoint: s.setpoint,
    pressure: s.pressure, temperature: s.temperature,
    fillPump: s.fillPump, drainValve: s.drainValve,
    alarmLow: s.alarmLowLevel, alarmHigh: s.alarmHighLevel,
    mode: s.autoModeActive ? 'auto' : 'manual',
  }));
}

// Handle commands from MQTT clients
aedes.on('publish', (packet, client) => {
  if (!client) return;
  const topic   = packet.topic;
  const payload = packet.payload?.toString() || '';
  if (!topic.startsWith('tank/commands/')) return;
  if (topic === 'tank/commands/auto_mode')    sendCommand('auto_mode',    payload === 'true');
  if (topic === 'tank/commands/pump_manual')  sendCommand('pump_manual',  payload === 'true');
  if (topic === 'tank/commands/drain_manual') sendCommand('drain_manual', payload === 'true');
  if (topic === 'tank/commands/reset')        sendCommand('level_reset');
  if (topic === 'tank/commands/setpoint')     sendCommand('setpoint',     parseFloat(payload));
  if (topic === 'tank/commands/dead_band')    sendCommand('dead_band',    parseFloat(payload));
  if (topic === 'tank/commands/estop')        sendCommand('emergency_stop');
});

mqttNet.listen(CFG.mqttPort, () => console.log(`[MQTT] Broker listening on port ${CFG.mqttPort}`));

// ── Modbus TCP Server ─────────────────────────────────────────────────────────
function getCoil(addr) {
  switch (addr) {
    case 0: return state.fillPump;       case 1: return state.drainValve;
    case 2: return state.alarmLowLevel;  case 3: return state.alarmHighLevel;
    case 4: return state.autoModeOutput; case 8: return state.cmdAutoMode;
    case 9: return state.cmdPumpManual;  case 10: return state.cmdDrainManual;
    case 11: return state.cmdLevelReset; default: return false;
  }
}

function getRegister(addr) {
  switch (addr) {
    case 0: return Math.round(state.tankLevel    * 100);
    case 1: return Math.round(state.setpoint     * 100);
    case 2: return Math.round(state.deadBand     * 100);
    case 3: return Math.round(state.pressure     * 1000);
    case 4: return Math.round(state.temperature  * 10);
    default: return 0;
  }
}

function handleModbusPDU(fc, pdu) {
  switch (fc) {
    case 0x01: case 0x02: {
      const start = pdu.readUInt16BE(0), qty = pdu.readUInt16BE(2);
      const bc = Math.ceil(qty / 8);
      const out = Buffer.alloc(1 + bc, 0);
      out[0] = bc;
      for (let i = 0; i < qty; i++)
        if (getCoil(start + i)) out[1 + Math.floor(i/8)] |= (1 << (i%8));
      return out;
    }
    case 0x03: case 0x04: {
      const start = pdu.readUInt16BE(0), qty = pdu.readUInt16BE(2);
      const out = Buffer.alloc(1 + qty * 2);
      out[0] = qty * 2;
      for (let i = 0; i < qty; i++) out.writeUInt16BE(getRegister(start+i), 1+i*2);
      return out;
    }
    case 0x05: {
      const addr = pdu.readUInt16BE(0), val = pdu.readUInt16BE(2);
      const boolVal = val === 0xFF00;
      if      (addr === 8)  sendCommand('auto_mode',    boolVal);
      else if (addr === 9)  sendCommand('pump_manual',  boolVal);
      else if (addr === 10) sendCommand('drain_manual', boolVal);
      else if (addr === 11 && boolVal) sendCommand('level_reset');
      else if (addr === 12 && boolVal) sendCommand('emergency_stop');
      return Buffer.from(pdu);
    }
    case 0x06: {
      const addr = pdu.readUInt16BE(0), val = pdu.readUInt16BE(2);
      if (addr === 1) sendCommand('setpoint',  val / 100);
      if (addr === 2) sendCommand('dead_band', val / 100);
      return Buffer.from(pdu);
    }
    default: return Buffer.from([fc | 0x80, 0x01]);
  }
}

const modbusServer = net.createServer((socket) => {
  let buf = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 6) {
      const len = buf.readUInt16BE(4);
      if (buf.length < 6 + len) break;
      const transId = buf.readUInt16BE(0), unitId = buf[6], fc = buf[7];
      const pdu = buf.slice(8, 6 + len);
      const resp = handleModbusPDU(fc, pdu);
      const header = Buffer.alloc(6);
      header.writeUInt16BE(transId, 0); header.writeUInt16BE(0, 2);
      header.writeUInt16BE(resp.length + 2, 4);
      socket.write(Buffer.concat([header, Buffer.from([unitId, fc]), resp]));
      buf = buf.slice(6 + len);
    }
  });
  socket.on('error', () => {});
});

modbusServer.listen(CFG.modbusPort, '0.0.0.0', () =>
  console.log(`[Modbus] TCP server listening on port ${CFG.modbusPort} (Unit ID 1)`));

// ── REST Proxy (HTTP API) ─────────────────────────────────────────────────────
const httpServer = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'GET' && req.url === '/tank/status') {
    res.writeHead(200); res.end(JSON.stringify({ ok: true, data: state })); return;
  }

  if (req.method === 'POST' && req.url === '/tank/command') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      try {
        const { action, value } = JSON.parse(body);
        sendCommand(action, value);
        res.writeHead(200); res.end(JSON.stringify({ ok: true }));
      } catch { res.writeHead(400); res.end(JSON.stringify({ ok: false, error: 'bad json' })); }
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/tank/registers') {
    res.writeHead(200); res.end(JSON.stringify({
      ok: true,
      coils: [0,1,2,3,4,8,9,10,11].map(a => ({ address: a, value: getCoil(a) })),
      registers: [0,1,2,3,4].map(a => ({ address: a, raw: getRegister(a) })),
    })); return;
  }

  res.writeHead(404); res.end(JSON.stringify({ ok: false, error: 'not found' }));
});

httpServer.listen(CFG.httpPort, '0.0.0.0', () =>
  console.log(`[HTTP] REST proxy on port ${CFG.httpPort}`));

// ── Elasticsearch pusher ──────────────────────────────────────────────────────
function pushElasticsearch(s) {
  if (!CFG.esUrl) return;
  const body = JSON.stringify({
    '@timestamp': s.ts, tankLevel: s.tankLevel, setpoint: s.setpoint,
    pressure: s.pressure, temperature: s.temperature,
    fillPump: s.fillPump, drainValve: s.drainValve,
    alarmLowLevel: s.alarmLowLevel, alarmHighLevel: s.alarmHighLevel,
    mode: s.autoModeActive ? 'auto' : 'manual',
    interlockHighHigh: s.interlockHighHigh, interlockLowLow: s.interlockLowLow,
  });
  const url = new URL(`${CFG.esUrl}/${CFG.esIndex}/_doc`);
  const lib = url.protocol === 'https:' ? https : http;
  const req = lib.request({ hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 9200),
    path: url.pathname, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
  }, () => {});
  req.on('error', () => {});
  req.write(body); req.end();
}

// ── SQL Server logger ─────────────────────────────────────────────────────────
async function initMssql() {
  if (!CFG.mssqlServer) return;
  try {
    const mssql = require('mssql');
    mssqlPool = await mssql.connect({
      server: CFG.mssqlServer, user: CFG.mssqlUser,
      password: CFG.mssqlPassword, database: CFG.mssqlDatabase,
      options: { encrypt: true, trustServerCertificate: true },
    });
    await mssqlPool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='TankReadings' AND xtype='U')
      CREATE TABLE TankReadings (
        Id            BIGINT IDENTITY PRIMARY KEY,
        Timestamp     DATETIME2 NOT NULL,
        TankLevel     FLOAT NOT NULL,
        Setpoint      FLOAT NOT NULL,
        Pressure      FLOAT NOT NULL,
        Temperature   FLOAT NOT NULL,
        FillPump      BIT NOT NULL,
        DrainValve    BIT NOT NULL,
        AlarmLowLevel BIT NOT NULL,
        AlarmHighLevel BIT NOT NULL,
        Mode          NVARCHAR(10) NOT NULL
      )
    `);
    console.log('[MSSQL] Connected and table ready');
  } catch (e) { console.error('[MSSQL] Connection failed:', e.message); }
}

async function logMssql(s) {
  if (!mssqlPool) return;
  try {
    const mssql = require('mssql');
    await mssqlPool.request()
      .input('ts',   mssql.DateTime2, new Date(s.ts))
      .input('lv',   mssql.Float,   s.tankLevel)
      .input('sp',   mssql.Float,   s.setpoint)
      .input('pr',   mssql.Float,   s.pressure)
      .input('tp',   mssql.Float,   s.temperature)
      .input('fp',   mssql.Bit,     s.fillPump ? 1 : 0)
      .input('dv',   mssql.Bit,     s.drainValve ? 1 : 0)
      .input('al',   mssql.Bit,     s.alarmLowLevel ? 1 : 0)
      .input('ah',   mssql.Bit,     s.alarmHighLevel ? 1 : 0)
      .input('md',   mssql.NVarChar, s.autoModeActive ? 'auto' : 'manual')
      .query(`INSERT INTO TankReadings (Timestamp,TankLevel,Setpoint,Pressure,Temperature,FillPump,DrainValve,AlarmLowLevel,AlarmHighLevel,Mode)
              VALUES (@ts,@lv,@sp,@pr,@tp,@fp,@dv,@al,@ah,@md)`);
  } catch (e) { console.error('[MSSQL] Insert failed:', e.message); }
}

// ── Periodic data logging ─────────────────────────────────────────────────────
setInterval(() => {
  pushElasticsearch(state);
  logMssql(state);
}, CFG.logInterval);

// ── Startup ───────────────────────────────────────────────────────────────────
console.log('=== ICS Water Tank Gateway ===');
console.log(`SCADA WebSocket : ${CFG.scadaWsUrl}`);
console.log(`Modbus TCP      : 0.0.0.0:${CFG.modbusPort}  (Unit ID 1)`);
console.log(`MQTT Broker     : 0.0.0.0:${CFG.mqttPort}`);
console.log(`REST Proxy      : http://0.0.0.0:${CFG.httpPort}`);
console.log(`Elasticsearch   : ${CFG.esUrl || '(disabled)'}`);
console.log(`SQL Server      : ${CFG.mssqlServer || '(disabled)'}`);
console.log('');

initMssql().then(() => connectScada());

#!/usr/bin/env node
/**
 * ICS Water Tank SCADA — Standalone Server
 * =========================================
 * Self-contained: PLC simulation + Modbus TCP + MQTT (WS) +
 * WebSocket + REST API + serves the browser UI.
 *
 * Requirements: Node.js >= 18
 *
 * Install:  npm install
 * Run:      node server.js
 * Open:     http://localhost:3000
 *
 * Modbus TCP:  localhost:502   (Unit ID 1)
 * MQTT broker: localhost:1883  (TCP)  or  ws://localhost:3000/mqtt  (WebSocket)
 * REST API:    http://localhost:3000/api/tank/...
 * WebSocket:   ws://localhost:3000/api/tank/ws
 */

'use strict';

const http    = require('http');
const net     = require('net');
const path    = require('path');
const fs      = require('fs');
const { EventEmitter } = require('events');
const { Duplex } = require('stream');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');

const PORT         = parseInt(process.env.PORT    || '3000');
const MODBUS_PORT  = parseInt(process.env.MODBUS_PORT || '502');

// ── MIME types for static file serving ──────────────────────────────────────
const MIME = {
  '.html': 'text/html', '.js':  'application/javascript',
  '.css':  'text/css',  '.svg': 'image/svg+xml',
  '.png':  'image/png', '.ico': 'image/x-icon',
  '.woff2':'font/woff2', '.woff':'font/woff', '.ttf':'font/ttf',
  '.json': 'application/json', '.txt': 'text/plain',
  '.csv':  'text/csv', '.sql': 'text/plain', '.ndjson': 'application/x-ndjson',
};

// ╔══════════════════════════════════════════════════════════════════╗
// ║  PLC ENGINE  (100ms scan — IEC 61131-3 ST CuveRegulationAvancee) ║
// ╚══════════════════════════════════════════════════════════════════╝
const TANK_HEIGHT_M = 3.0;

class PLCEngine extends EventEmitter {
  constructor() {
    super();
    this.state = {
      lowSensor: false, highSensor: false,
      fillPump: false, drainValve: false,
      alarmLowLevel: false, alarmHighLevel: false, autoModeOutput: false,
      cmdAutoMode: false, cmdPumpManual: false, cmdDrainManual: false,
      cmdLevelReset: false, cmdEStop: false,
      tankLevel: 53.0, setpoint: 60.0, deadBand: 3.0,
      pressure: 0.156, temperature: 18.0,
      interlockHighHigh: false, interlockLowLow: false, interlockDualCommand: false,
      autoModeActive: false, scanCount: 0, scanTimeMs: 0,
      ts: new Date().toISOString(),
    };
    this._timer = null;
  }

  start() {
    this._timer = setInterval(() => this._scan(), 100);
  }

  getState() { return { ...this.state }; }

  command(action, value) {
    const s = this.state;
    switch (action) {
      case 'auto_mode':      s.cmdAutoMode    = Boolean(value); if (!value) s.autoModeActive = false; break;
      case 'pump_manual':    s.cmdPumpManual  = Boolean(value); break;
      case 'drain_manual':   s.cmdDrainManual = Boolean(value); break;
      case 'level_reset':    s.cmdLevelReset  = true; break;
      case 'setpoint':       s.setpoint  = Math.max(15, Math.min(85, Number(value))); break;
      case 'dead_band':      s.deadBand  = Math.max(1,  Math.min(10,  Number(value))); break;
      case 'emergency_stop': s.cmdEStop = true; s.cmdAutoMode = false; s.autoModeActive = false; s.cmdPumpManual = false; s.cmdDrainManual = false; s.fillPump = false; s.drainValve = false; break;
      case 'coil_write': {
        const { address: a, value: v } = value;
        if (a === 8)  this.command('auto_mode',    Boolean(v));
        if (a === 9)  s.cmdPumpManual  = Boolean(v);
        if (a === 10) s.cmdDrainManual = Boolean(v);
        if (a === 11 && v) this.command('level_reset');
        if (a === 12 && v) this.command('emergency_stop');
        break;
      }
      case 'register_write': {
        const { address: a, value: v } = value;
        if (a === 1) this.command('setpoint',  v / 100);
        if (a === 2) this.command('dead_band', v / 100);
        break;
      }
    }
  }

  _scan() {
    const t0 = Date.now();
    const s  = this.state;

    if (s.cmdLevelReset)  { s.tankLevel = 53.0; s.cmdLevelReset = false; }
    if (s.cmdEStop)       { s.fillPump = false; s.drainValve = false; s.cmdEStop = false; }

    s.autoModeActive = s.cmdAutoMode;
    s.autoModeOutput = s.autoModeActive;

    if (s.autoModeActive) {
      if      (s.tankLevel < s.setpoint - s.deadBand) { s.fillPump = true;  s.drainValve = false; }
      else if (s.tankLevel > s.setpoint + s.deadBand) { s.fillPump = false; s.drainValve = true;  }
      else                                             { s.fillPump = false; s.drainValve = false; }
    } else {
      const p = s.cmdPumpManual, d = s.cmdDrainManual;
      s.interlockDualCommand = p && d;
      if      (p && !d) { s.fillPump = true;  s.drainValve = false; }
      else if (d && !p) { s.fillPump = false; s.drainValve = true;  }
      else              { s.fillPump = false; s.drainValve = false; }
    }

    if (s.tankLevel >= 95) { s.fillPump  = false; s.interlockHighHigh = true;  } else { s.interlockHighHigh = false; }
    if (s.tankLevel <= 10) { s.drainValve = false; s.interlockLowLow  = true;  } else { s.interlockLowLow  = false; }

    if (s.fillPump  && !s.drainValve) s.tankLevel += 0.05;
    if (s.drainValve && !s.fillPump)  s.tankLevel -= 0.07;
    s.tankLevel = Math.max(0, Math.min(100, s.tankLevel));

    s.lowSensor      = s.tankLevel <= 15;
    s.highSensor     = s.tankLevel >= 85;
    s.alarmLowLevel  = s.tankLevel <= 10 || (s.lowSensor && !s.highSensor);
    s.alarmHighLevel = s.tankLevel >= 90 || s.highSensor;

    const fillM   = (s.tankLevel / 100) * TANK_HEIGHT_M;
    s.pressure    = parseFloat(((1000 * 9.81 * fillM) / 100000).toFixed(4));
    s.temperature = parseFloat((18 + Math.sin(s.scanCount * 0.002) * 1.5 + (s.fillPump ? 0.3 : 0)).toFixed(2));
    s.scanCount  += 1;
    s.scanTimeMs  = Date.now() - t0;
    s.ts          = new Date().toISOString();

    this.emit('scan', this.getState());
  }
}

const plc = new PLCEngine();
plc.start();
console.log('[PLC] Engine started — 100ms scan cycle');

// ╔══════════════════════════════════════════════════════╗
// ║  EXPRESS APP                                          ║
// ╚══════════════════════════════════════════════════════╝
const app = express();
app.use(require('cors')());
app.use(express.json());

// In-memory history (1 sample/sec, max 1000)
const history = [];
let lastHistoryTs = 0;
plc.on('scan', (s) => {
  const now = Date.now();
  if (now - lastHistoryTs >= 1000) {
    lastHistoryTs = now;
    history.push({ ts: s.ts, level: +s.tankLevel.toFixed(2), setpoint: s.setpoint,
      pressure: s.pressure, temperature: s.temperature,
      fillPump: s.fillPump, drainValve: s.drainValve,
      mode: s.autoModeActive ? 'auto' : 'manual' });
    if (history.length > 1000) history.shift();
  }
});

// REST API
app.get('/api/tank/status',    (_req, res) => res.json({ ok: true, data: plc.getState() }));
app.get('/api/tank/registers', (_req, res) => {
  const s = plc.getState();
  res.json({ ok: true,
    coils: { 0: s.fillPump, 1: s.drainValve, 2: s.alarmLowLevel, 3: s.alarmHighLevel,
             4: s.autoModeOutput, 8: s.cmdAutoMode, 9: s.cmdPumpManual,
             10: s.cmdDrainManual, 11: s.cmdLevelReset, 12: s.cmdEStop },
    holdingRegisters: {
      0: Math.round(s.tankLevel * 100), 1: Math.round(s.setpoint * 100),
      2: Math.round(s.deadBand * 100),  3: Math.round(s.pressure * 1000),
      4: Math.round(s.temperature * 10),
    }
  });
});
app.post('/api/tank/command',  (req, res) => {
  const { action, value } = req.body;
  if (!action) return res.status(400).json({ ok: false, error: 'action required' });
  plc.command(action, value);
  res.json({ ok: true, state: plc.getState() });
});
app.get('/api/tank/history', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '100'), 1000);
  res.json({ ok: true, count: history.length, data: history.slice(-limit) });
});
app.get('/api/tank/config', (req, res) => {
  const host = req.headers.host || `localhost:${PORT}`;
  res.json({ ok: true, endpoints: {
    rest:    `http://${host}/api/tank/status`,
    ws:      `ws://${host}/api/tank/ws`,
    mqtt_ws: `ws://${host}/mqtt`,
    modbus:  { note: `Modbus TCP on port ${MODBUS_PORT}`, port: MODBUS_PORT },
  }});
});
app.get('/api/healthz', (_req, res) => res.json({ ok: true }));

// Static file serving (built frontend)
const publicDir = path.join(__dirname, 'public');
app.use((req, res, next) => {
  // Bridge files
  const bridgeDir = path.join(publicDir, 'bridge');
  if (req.path.startsWith('/bridge/')) {
    const file = path.join(bridgeDir, req.path.slice(8));
    if (fs.existsSync(file)) {
      const ext = path.extname(file);
      res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(file)}"`);
      return res.sendFile(file);
    }
  }
  next();
});
app.use(express.static(publicDir));
app.get('*', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// ╔══════════════════════════════════════════════════════╗
// ║  HTTP SERVER + WEBSOCKET                              ║
// ╚══════════════════════════════════════════════════════╝
const httpServer = http.createServer(app);

// Tank WebSocket (/api/tank/ws)
const tankWss = new WebSocketServer({ noServer: true });
tankWss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'state', payload: plc.getState() }));
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'command' && msg.action) plc.command(msg.action, msg.value);
    } catch { /* ignore */ }
  });
});
plc.on('scan', (state) => {
  const msg = JSON.stringify({ type: 'state', payload: state });
  for (const c of tankWss.clients) if (c.readyState === WebSocket.OPEN) c.send(msg);
});

// MQTT WebSocket (/mqtt) via Aedes
const mqttWss = new WebSocketServer({ noServer: true });

async function startMqtt() {
  try {
    const { Aedes } = require('aedes');
    const broker = await Aedes.createBroker();

    mqttWss.on('connection', (ws) => broker.handle(wsToStream(ws)));

    broker.on('publish', (packet, client) => {
      if (!client) return;
      const topic = packet.topic || '';
      const payload = packet.payload?.toString() || '';
      if (!topic.startsWith('tank/commands/')) return;
      if (topic === 'tank/commands/auto_mode')    plc.command('auto_mode',    payload === 'true');
      if (topic === 'tank/commands/pump_manual')  plc.command('pump_manual',  payload === 'true');
      if (topic === 'tank/commands/drain_manual') plc.command('drain_manual', payload === 'true');
      if (topic === 'tank/commands/reset')        plc.command('level_reset');
      if (topic === 'tank/commands/setpoint')     plc.command('setpoint',     parseFloat(payload));
      if (topic === 'tank/commands/dead_band')    plc.command('dead_band',    parseFloat(payload));
      if (topic === 'tank/commands/estop')        plc.command('emergency_stop');
    });

    function pub(topic, value) {
      broker.publish({ topic, payload: Buffer.from(String(value)), qos: 0, retain: true, dup: false, cmd: 'publish' }, () => {});
    }
    setInterval(() => {
      const s = plc.getState();
      pub('tank/sensors/level',       s.tankLevel.toFixed(2));
      pub('tank/sensors/pressure',    s.pressure.toFixed(4));
      pub('tank/sensors/temperature', s.temperature.toFixed(2));
      pub('tank/alarms/low',          String(s.alarmLowLevel));
      pub('tank/alarms/high',         String(s.alarmHighLevel));
      pub('tank/status/pump',         String(s.fillPump));
      pub('tank/status/valve',        String(s.drainValve));
      pub('tank/status/mode',         s.autoModeActive ? 'auto' : 'manual');
      pub('tank/telemetry',           JSON.stringify({
        ts: s.ts, level: s.tankLevel, setpoint: s.setpoint,
        pressure: s.pressure, temperature: s.temperature,
        fillPump: s.fillPump, drainValve: s.drainValve,
        alarmLow: s.alarmLowLevel, alarmHigh: s.alarmHighLevel,
        mode: s.autoModeActive ? 'auto' : 'manual',
      }));
    }, 500);

    // MQTT TCP (port 1883)
    const mqttTcp = net.createServer(broker.handle.bind(broker));
    mqttTcp.listen(1883, '0.0.0.0', () => console.log('[MQTT] TCP broker on port 1883'));
    mqttTcp.on('error', (e) => console.warn('[MQTT] TCP error:', e.message));
    console.log('[MQTT] WS broker on /mqtt');
  } catch (e) {
    console.warn('[MQTT] Broker not available (install aedes):', e.message);
  }
}

// WebSocket upgrade routing
httpServer.on('upgrade', (req, socket, head) => {
  if (req.url?.startsWith('/api/tank/ws')) {
    tankWss.handleUpgrade(req, socket, head, (ws) => tankWss.emit('connection', ws, req));
  } else if (req.url?.startsWith('/mqtt')) {
    mqttWss.handleUpgrade(req, socket, head, (ws) => mqttWss.emit('connection', ws, req));
  } else {
    socket.destroy();
  }
});

// ╔══════════════════════════════════════════════════════╗
// ║  MODBUS TCP SERVER (port 502)                         ║
// ╚══════════════════════════════════════════════════════╝
function getCoil(s, a)     { return [s.fillPump,s.drainValve,s.alarmLowLevel,s.alarmHighLevel,s.autoModeOutput,false,false,false,s.cmdAutoMode,s.cmdPumpManual,s.cmdDrainManual,s.cmdLevelReset,s.cmdEStop][a] ?? false; }
function getReg(s, a)      { return [Math.round(s.tankLevel*100),Math.round(s.setpoint*100),Math.round(s.deadBand*100),Math.round(s.pressure*1000),Math.round(s.temperature*10)][a] ?? 0; }

function handleMbPdu(fc, pdu) {
  const s = plc.getState();
  if (fc === 1 || fc === 2) {
    const start = pdu.readUInt16BE(0), qty = pdu.readUInt16BE(2);
    const bc = Math.ceil(qty / 8), out = Buffer.alloc(1 + bc, 0); out[0] = bc;
    for (let i = 0; i < qty; i++) if (getCoil(s, start+i)) out[1+Math.floor(i/8)] |= 1 << (i%8);
    return out;
  }
  if (fc === 3 || fc === 4) {
    const start = pdu.readUInt16BE(0), qty = pdu.readUInt16BE(2);
    const out = Buffer.alloc(1 + qty*2); out[0] = qty*2;
    for (let i = 0; i < qty; i++) out.writeUInt16BE(getReg(s, start+i), 1+i*2);
    return out;
  }
  if (fc === 5) { plc.command('coil_write', { address: pdu.readUInt16BE(0), value: pdu.readUInt16BE(2) === 0xFF00 }); return Buffer.from(pdu); }
  if (fc === 6) { plc.command('register_write', { address: pdu.readUInt16BE(0), value: pdu.readUInt16BE(2) }); return Buffer.from(pdu); }
  return Buffer.from([fc|0x80, 0x01]);
}

const modbusSrv = net.createServer((sock) => {
  let buf = Buffer.alloc(0);
  sock.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 6) {
      const len = buf.readUInt16BE(4);
      if (buf.length < 6 + len) break;
      const tid = buf.readUInt16BE(0), uid = buf[6], fc = buf[7];
      const resp = handleMbPdu(fc, buf.slice(8, 6+len));
      const hdr = Buffer.alloc(6);
      hdr.writeUInt16BE(tid,0); hdr.writeUInt16BE(0,2); hdr.writeUInt16BE(resp.length+2,4);
      sock.write(Buffer.concat([hdr, Buffer.from([uid,fc]), resp]));
      buf = buf.slice(6+len);
    }
  });
  sock.on('error', () => {});
});

modbusSrv.listen(MODBUS_PORT, '0.0.0.0', () =>
  console.log(`[Modbus] TCP server on port ${MODBUS_PORT} (Unit ID 1)`));
modbusSrv.on('error', (e) => console.warn(`[Modbus] Error (try sudo for port 502 or set MODBUS_PORT=5020):`, e.message));

// ── Helper ───────────────────────────────────────────────────────────────────
function wsToStream(ws) {
  const s = new Duplex({
    read() {},
    write(chunk, _, cb) { if (ws.readyState === 1) ws.send(chunk); cb(); },
    destroy(err, cb) { try { ws.terminate(); } catch {} cb(err); },
  });
  ws.on('message', (d) => s.push(typeof d === 'string' ? Buffer.from(d) : d));
  ws.on('close',   () => { if (!s.destroyed) s.push(null); });
  ws.on('error',   (e) => { if (!s.destroyed) s.destroy(e); });
  return s;
}

// ── Start ────────────────────────────────────────────────────────────────────
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   ICS WATER TANK SCADA  —  Standalone Server  ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`  UI (browser):  http://localhost:${PORT}`);
  console.log(`  REST API:      http://localhost:${PORT}/api/tank/status`);
  console.log(`  WebSocket:     ws://localhost:${PORT}/api/tank/ws`);
  console.log(`  MQTT (WS):     ws://localhost:${PORT}/mqtt`);
  console.log(`  MQTT (TCP):    localhost:1883`);
  console.log(`  Modbus TCP:    localhost:${MODBUS_PORT}  (Unit ID 1)`);
  console.log('');
});

startMqtt();

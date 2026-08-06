# Sensor Blinding / False Data Injection — Results

## Attack Parameters
- Target: NiveauCuveSortie register (address 0), forced to 54 via rapid FC06 writes (every 50ms)
- Pump forced ON via coil 9 (CmdPompeManu) throughout, to drive true level upward
- Attack window: 2026-08-06T04:47:13 to 2026-08-06T04:48:04 (~51 seconds)

## Result
- Modbus register 0 reported FROZEN at value 54 for the ENTIRE attack window (confirmed via
  25 consecutive 2-second polls, all returning 54)
- True physical level, observed independently via OpenPLC web UI live variable monitor,
  had risen to 95 by the time the attack ended -- confirmed by PompeRemplissage flipping
  True->False (95% safety cutoff firing) and NiveauCuveSortie showing 95 in the web UI,
  moments before the frozen Modbus value.
- Immediately after the attack script stopped (releasing the register), the next Modbus
  read returned the TRUE value: 95 -- confirming the register was never actually changed
  internally; it was being overwritten externally faster than the PLC's 100ms scan could
  restore it, and the moment the external writes stopped, the true internal state was
  revealed instantly.

## Divergence magnitude
- Reported (frozen): 54, constant
- True (independently observed): risen to 95 (safety cutoff)
- Divergence: 41 percentage points, over ~51 seconds

## Significance
Confirms Section 5.2.3 hypothesis precisely: the automatic control loop continued operating
correctly on true internal state (proven by the safety cutoff firing appropriately at 95%),
while every external Modbus-based observer would have seen a flat, unchanging value the
entire time. This is a genuine blind spot for any detection mechanism relying on Modbus-
reported telemetry alone -- the divergence is only visible via an independent, out-of-band
observation channel (here, the OpenPLC web UI's internal variable inspector), not via the
same protocol being attacked.

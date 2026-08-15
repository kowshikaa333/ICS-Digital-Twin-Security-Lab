# Parameter/Setpoint Modification — Results

## Attempt 1: Register-level access (lower capability tier)
- Target: ConsigneSortie (holding register 1)
- Action: write_register(1, 80) attempt to shift setpoint from 60 to 80
- Result: Write succeeded at protocol level (no Modbus exception), but value reverted
  to 60 on next read (1 second later)
- Conclusion: ConsigneSortie is a PLC OUTPUT register (ConsigneSortie := REAL_TO_INT(
  ConsigneNiveau) executed every scan), not an input the control logic reads from.
  Raw Modbus writes to this register are silently overwritten by the next 100ms scan
  cycle the identical structural pattern observed during the Sensor Blinding attempt
  on NiveauCuveSortie (register 0).

## Significance
Confirms the register-level access path (lower attacker capability tier) CANNOT modify
the regulation setpoint in this implementation, since neither ConsigneNiveau nor
BandeMorte is exposed as a writable input register per the Modbus map (Table 13) --
only their computed OUTPUT is exposed. This is a genuine, empirically-confirmed hardening
property of this specific implementation, not merely a theoretical claim: an attacker with
only network-level Modbus write access, and no engineering-workstation access, cannot shift
the setpoint via this vector. Achieving true setpoint modification requires the higher
capability tier direct ST program reprogramming via the OpenPLC web editor confirming
Section 5.2.6's framing that register-level and engineering-access-level attacks represent
meaningfully different, non-equivalent threat tiers.

## Attempt 2: Engineering-workstation-level access (higher capability tier)
- Action: Directly edited CuveRegulationAvancee.st via OpenPLC web editor, changing
  ConsigneNiveau from 60.0 to 80.0. Recompiled and redeployed.
- Verification: ConsigneSortie register (1) confirmed reading 80 post-edit (vs. 60
  pre-edit), where the register-level write attempt in Attempt 1 had silently failed.
- Level trajectory confirmed shift toward new setpoint: 54 -> 68 over 30 seconds in
  AUTO mode (climbing toward 80+/-3 target, versus prior 60+/-3 behavior).

## Combined Significance
Confirms Section 5.2.6's two-tier framing empirically: register-level Modbus access alone
(Attempt 1) cannot shift the regulation setpoint, since ConsigneSortie is a PLC-computed
output, not an input. Engineering-workstation-level access via the OpenPLC web editor
(Attempt 2) succeeds immediately and completely, changing both the reported setpoint value
and the actual physical control target. This demonstrates a genuine, non-trivial security
boundary in the current implementation: the most severe form of this attack requires a
materially higher-privilege compromise than simple network/Modbus access.

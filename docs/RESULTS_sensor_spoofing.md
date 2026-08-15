# Sensor Spoofing — Results

## Attack
- Edited CuveRegulationAvancee.st via OpenPLC web editor
- Added: CapteurNiveauHaut := FALSE; immediately before the alarm logic block
- Forces the physical input variable itself to a fixed value at the point the
  control logic reads it (distinct from Sensor Blinding, which corrupts only the
  externally-reported Modbus register)
- Recompiled and redeployed successfully

## Result
- Level driven from 55 to 95 via forced pump command (coil 9), same procedure as
  Command Injection
- AlarmeNivHaut remained FALSE from level 55 through level 89 (confirming the
  spoofed sensor input was NOT contributing to the alarm during this range)
- AlarmeNivHaut flipped to TRUE at level=91, and pump correctly cut off at level=95

## Interpretation
The alarm logic (AlarmeNivHaut := (NiveauSimu >= 90.0) OR CapteurNiveauHaut) contains
TWO independent triggering conditions joined by OR: a level-value-based check and a
sensor-based check. The spoofing attack successfully and completely defeated the
sensor-based half of this condition (confirmed: CapteurNiveauHaut contributed FALSE
throughout, as designed) but the alarm still fired via the INDEPENDENT level-value
check, which reads NiveauSimu directly and is unaffected by sensor-level spoofing.

This is a genuine, unanticipated finding beyond the thesis's original hypothesis
(Section 5.2.2, which predicted spoofing would produce "no discordance to detect...
the PLC's commands remain fully self-consistent with its own falsified understanding").
The result instead reveals that THIS SPECIFIC alarm implements a form of redundant,
defense-in-depth logic: a single spoofed sensor input alone cannot fully blind an
alarm that also independently checks the underlying process value. A more complete
spoofing attack would require ALSO falsifying the value-based check (i.e., modifying
the NiveauSimu variable itself, or the comparison threshold), which begins to overlap
with Technique T0833 (Modify Control Logic) rather than pure sensor input spoofing --
suggesting a meaningful practical distinction between spoofing a SENSOR INPUT versus
spoofing the PROCESS VALUE the control logic derives its own decisions from.

The 95% safety cutoff (pump forced off) fired correctly and independently of both the
sensor spoof and the alarm state, confirming this safety interlock is architecturally
separate from the alarm-reporting logic exactly as designed.

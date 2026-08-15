# Process Fatigue / Chattering — Results

## Attack Parameters
- Alternating CmdPompeManu (coil 9) / CmdVidangeManu (coil 10) every 300ms
- Duration: 60 seconds
- Attack window: 2026-08-06T04:51:43 to 2026-08-06T04:52:44

## Measured Results
- Total toggles: 197
- Toggle frequency: 3.28 Hz
- Tank level during attack: mean=51.91, min=49, max=55

## Significance
Confirms Section 5.2.4 hypothesis: the tank level remained within a narrow, entirely
normal-looking band (49-55) throughout the attack never approaching either the
10% low or 95%/90% high alarm thresholds. A simple level-threshold alarm would report
zero anomalies. The actual abnormality is invisible at the process-value level and
exists only in actuator toggle frequency (3.28 Hz, versus a legitimate AUTO-mode
regulation cycle that switches states on the order of tens of seconds when crossing
the +/-3% hysteresis deadband). This demonstrates that threshold-based detection is
structurally blind to legitimate-looking commands issued at an illegitimate rate --
the damage in a real system would accrue as cumulative mechanical wear (relay contact
degradation, valve-seat erosion) rather than any single instantaneous reading crossing
a safety boundary.

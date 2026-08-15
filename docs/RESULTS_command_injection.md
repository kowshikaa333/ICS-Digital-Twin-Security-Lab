# Command Injection Attack — Results

## Attack Parameters
- Target: coil 9 (CmdPompeManu), forced True
- Start: 2026-08-06T04:29:59.036610
- End (95% cutoff reached): 2026-08-06T04:31:24.254488
- Duration to cutoff: ~85 seconds
- Rate of rise: ~0.5%/sec (consistent with VariationRemplissage=0.05 per 100ms scan)

## Safety Interlock Behavior
- Tank rose 53% -> 95% continuously while pump_coil=True
- At exactly 95%, pump_coil flipped to False automatically (independent safety cutoff fired)
- Confirms Section 4.4: high-level cutoff evaluated after control branch, regardless of mode

## Discordance Detection Result
- Commands logged via ics-cmd-* (HMI/Node-RED path) during attack window: 0
- Telemetry entries (ics-process-state-*) during window: 500 (correctly captured pompe flip to True)
- Finding: Attack bypassed HMI/command layer entirely (raw Modbus write), so command-vs-telemetry
  discordance detector has no legitimate command entry to compare against. Discordance score is
  effectively undefined/zero not because the attack is invisible in telemetry, but because
  there is no command-side baseline to flag a mismatch against. This refines the thesis's original
  hypothesis (Section 5.3) that Command Injection would be "most likely caught quickly" direct
  Modbus writes bypassing HMI/API layers are structurally invisible to this specific detector design,
  regardless of severity.

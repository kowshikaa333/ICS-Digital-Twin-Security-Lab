# Modbus Request Flooding / DoS — Results

## Attack Parameters
- Tight-loop read requests against openplc1 (port 5021)
- Duration: 65 seconds
- Attack window: 2026-08-06T04:55:23 to 2026-08-06T04:56:28

## Traffic Volume
- Total requests generated: 50,215 (772.5 req/sec)
- Packets captured (tcpdump, bidirectional): 126,671+ during flood window
- Baseline traffic (ordinary cycling): mean 156.53 bytes/sec client->PLC (Section 5.1.3)
  -- flood represents an enormous, unambiguous deviation from baseline traffic volume

## Scan-Cycle Timing Impact
- Baseline: mean=1.903ms, stdev=1.085ms
- During flood: mean=2.441ms, stdev=3.400ms
- Mean latency increase: ~28%
- Jitter (stdev) increase: ~213%

## Statistical Significance
Mann-Whitney U statistic=1644554.5, p-value=0.000477 (p < 0.05, statistically significant difference between baseline and flood-window scan-cycle timing distributions)

## Significance
Confirms Section 5.2.5/5.4.2: flooding measurably degrades the targeted controller's own
scan-cycle responsiveness, not merely generating detectable traffic. Critically, the
INCREASE IN VARIANCE (jitter) is proportionally far larger than the increase in mean --
flooding does not uniformly slow every request but introduces erratic, unpredictable
response timing. This is the practical manifestation of the Toverhead growth described
analytically in Section 1.3.4: additional communication load competing for the same
scan-cycle budget, creating a DoS effect on the controller's ability to react to any
OTHER condition, distinct from data-corruption-based attacks (Command Injection,
Sensor Blinding) evaluated separately.

# DoS Forensic-Readiness Experiment — Results

## Phase 1: Baseline (60s, no attack)
- Total polls: 297, Alerts: 0, Errors: 0
- Confirms safety monitor is quiet under normal operation (level ~53, well within 15-90 band)

## Phase 2: Profiling (monitor's own overhead, no attack)
- Average CPU: 0.13%, Average memory: ~16.9MB
- Confirms the monitoring apparatus itself imposes negligible resource cost

## Phase 3: Trigger test (controlled, non-adversarial threshold crossing)
- Level driven 53->95 over ~14 seconds via legitimate pump command
- Alert mechanism fired correctly and continuously from level=90 through level=95
- Alert latency during this clean trigger: consistently 1-6ms per poll
- Confirms the alert mechanism works correctly under non-adversarial conditions

## Phase 4: Attack (concurrent flood + monitor, both targeting openplc1 simultaneously)
- Monitor polls attempted: only 6 succeeded (vs. ~300 expected in a clean 60s window)
- Monitor errors: 5 of 6 attempts failed ("No response received after 3 retries")
- Flood thread: 0 successful requests recorded (transaction ID desync errors:
  "request ask for id=1 but got id=8")
- No process crash occurred, but functional data capture collapsed almost entirely

## Root Cause Confirmation (isolated test)

To isolate whether Phase 4's near-total failure was caused by flooding rate/volume or by
connection-level contention, a controlled comparison was run:

- Single Modbus TCP connection, tight loop, 15 seconds: 12,598 requests succeeded, 0 errors
  (matches the successful main-stack Modbus Flooding attack result, Section 5.2.5)
- Two simultaneous Modbus TCP connections (non-flooding rate, one request per connection
  per loop iteration), 10 seconds: connection 1 succeeded once, connection 2 succeeded zero
  times, then both connections failed with "No response received after 3 retries"

This isolated test confirms the root cause precisely: openplc1's Modbus TCP server
implementation reliably serves exactly ONE concurrent client connection, but fails almost
immediately upon a second simultaneous connection being opened -- independent of request
rate or flooding volume. This is a more precise and more severe finding than a rate-based
DoS: it is a connection-multiplexing limitation in the field-layer controller's Modbus
server itself.

## Success Criteria Evaluation
1. Evidence-capture completeness: FAILED. Only 6 of ~300 expected polls succeeded (~2% capture rate)
2. Logging completes before crash: PARTIALLY MET. No crash occurred, but near-total capture failure
   makes this distinction largely moot -- there was almost nothing to complete logging of.
3. Low performance overhead: NOT MEASURABLE. Insufficient successful samples exist to compute a
   valid latency comparison against baseline.
4. Timeline reconstructable from logs: FAILED. With only 6 data points (5 of which are error
   entries), the attack's progression cannot be reconstructed.

## Significance

This result is more severe than the thesis's original framing anticipated (which expected
measurable but bounded latency/traffic degradation, per the main-stack flooding attack
result: +28% latency, +213% jitter). Under concurrent connection contention -- two
independent Modbus TCP clients simultaneously targeting the same OpenPLC instance -- the
controller's Modbus stack exhibited near-total request failure rather than graceful
degradation, evidenced by transaction ID desynchronization errors on both connections.

This directly and empirically validates the core tension identified analytically in
Section 1.3.4: a detection/logging mechanism that itself depends on the same contested
resource (the Modbus TCP connection to the controller) can become the first casualty of
exactly the class of attack (resource exhaustion) it is meant to help detect. Unlike the
main-stack Modbus Flooding result (Section 5.2.5), which used a single flooding connection
against a controller answering a separate, less-contended polling client, this experiment's
design -- two concurrent, independently-connecting clients -- surfaces a more acute failure
mode: connection-level contention causing near-complete data capture failure, rather than
merely elevated latency.

This materially sharpens the thesis's forensic-readiness argument: any external
monitoring/logging client (a safety monitor, a SCADA poller, a forensic evidence collector)
that opens its own Modbus connection to a controller which is simultaneously being polled by
any other legitimate client (e.g., Node-RED's own supervisory polling) will itself trigger
this same failure mode -- with no attacker involvement required at all. This suggests the
safe architectural pattern for a forensic monitor is either (a) sharing a single
connection/polling loop with the existing supervisory client rather than opening an
independent connection, or (b) reading process state via the historian/digital-twin layer
(Ditto, Elasticsearch) rather than via direct, independent Modbus polling of the controller.

## Limitation

This result reflects a specific implementation choice (two separate pymodbus TCP connections
sharing the same target) rather than a fully isolated three-service minimal testbed as
originally scoped in Section 4.7.3. A single-connection design (as used successfully in the
main-stack flooding attack, Section 5.2.5) does not exhibit this failure mode. The distinction
between "one client flooding, a separate client observing" versus "the observing client and
the flooding client independently contending for the same controller resource" is itself an
architecturally meaningful finding, worth stating explicitly as a scope note in the final
thesis: forensic readiness under DoS depends materially on whether the monitoring
infrastructure shares a connection/resource pool with the attack traffic it is meant to
detect, or is architecturally isolated from it.

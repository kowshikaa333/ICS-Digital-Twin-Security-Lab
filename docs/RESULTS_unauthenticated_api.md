# Unauthenticated API Access -- Results

## Attack
- Plain unauthenticated GET request: http://localhost:1880/flows
- No credentials, no token, no auth header supplied

## Result
- Full Node-RED flow definition returned with HTTP 200, zero authentication challenge
- Disclosed: Modbus target hostnames/ports (e.g. openplc1:502), flow tab names/labels,
  complete tag-decoding and command-building logic (per Appendix D)
- Total flow nodes disclosed: 107
- Modbus targets exposed: OpenPLC1 -> openplc1:502; OpenPLC2_Cuve -> <internal-ip-redacted>:5022;
  unnamed target -> <internal-ip-redacted>:5021
- Flow tabs exposed: "Cuve", "ICS Water Tank SCADA"
- Note: disclosure includes a real internal network IP address, not just Docker service
  hostnames -- reveals actual network topology beyond container-internal naming. The specific
  address is redacted in this public document since it corresponds to live infrastructure;
  the finding itself (real IP disclosure via an unauthenticated endpoint) is the reportable
  result, not the address value.

## Significance
Confirms Section 5.2.7 / Technique T0871. Produces no direct physical process consequence,
but materially lowers the cost of executing every other attack in this thesis: an attacker
obtains the exact Modbus addresses, controller hostnames, and flow logic without any prior
reconnaissance effort, rather than needing to discover this information independently via
network scanning or protocol analysis.

import pandas as pd
import matplotlib.pyplot as plt

CSV_FILE = "traffic_openplc_clean.csv"
PLC_PORTS = {5021, 5022}
TIME_BIN = 1  # seconde

df = pd.read_csv(CSV_FILE)

# Conversion
for col in ["frame.time_epoch", "tcp.srcport", "tcp.dstport", "frame.len"]:
    df[col] = pd.to_numeric(df[col], errors="coerce")
df = df.dropna()

# Temps relatif
t0 = df["frame.time_epoch"].min()
df["time_rel"] = df["frame.time_epoch"] - t0
df["time_bin"] = (df["time_rel"] // TIME_BIN).astype(int)

# Requêtes vers PLC = trafic "SCADA/client"
df_req = df[df["tcp.dstport"].isin(PLC_PORTS)].copy()

# Réponses des PLC
df_resp = df[df["tcp.srcport"].isin(PLC_PORTS)].copy()

req_series = df_req.groupby("time_bin")["frame.len"].sum()
resp_series = df_resp.groupby("time_bin")["frame.len"].sum()

all_bins = sorted(set(req_series.index).union(set(resp_series.index)))
plot_df = pd.DataFrame(index=all_bins)
plot_df["Client_to_PLC"] = req_series
plot_df["PLC_to_Client"] = resp_series
plot_df = plot_df.fillna(0)

plt.figure(figsize=(10, 6))
plt.plot(plot_df.index, plot_df["Client_to_PLC"], label="Client/SCADA")
plt.plot(plot_df.index, plot_df["PLC_to_Client"], label="PLC(OpenPLC)")
plt.title("Healthy Run - Communication Sources")
plt.xlabel("Time [s]")
plt.ylabel("Total load [Bytes]")
plt.legend()
plt.grid(True)
plt.tight_layout()
plt.savefig("healthy_run_openplc.png", dpi=300)
plt.show()

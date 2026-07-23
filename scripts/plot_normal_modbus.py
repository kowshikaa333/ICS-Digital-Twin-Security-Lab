import pandas as pd
import matplotlib.pyplot as plt

CSV_FILE = "traffic_openplc_clean.csv"
PLC_PORTS = {5021, 5022}
TIME_BIN = 1  # seconde

df = pd.read_csv(CSV_FILE)

for col in ["frame.time_epoch", "tcp.srcport", "tcp.dstport", "frame.len"]:
    df[col] = pd.to_numeric(df[col], errors="coerce")
df = df.dropna()

# Temps relatif
t0 = df["frame.time_epoch"].min()
df["time_rel"] = df["frame.time_epoch"] - t0
df["time_bin"] = (df["time_rel"] // TIME_BIN).astype(int)

# Source client = paquets envoyés vers 5021/5022
df_client = df[df["tcp.dstport"].isin(PLC_PORTS)].copy()

# Source PLC = paquets envoyés depuis 5021/5022
df_plc = df[df["tcp.srcport"].isin(PLC_PORTS)].copy()

client_series = df_client.groupby("time_bin")["frame.len"].sum()
plc_series = df_plc.groupby("time_bin")["frame.len"].sum()

all_bins = sorted(set(client_series.index).union(set(plc_series.index)))
plot_df = pd.DataFrame(index=all_bins)
plot_df["Client"] = client_series
plot_df["PLC"] = plc_series
plot_df = plot_df.fillna(0)

# Statistiques
mu_client = plot_df["Client"].mean()
sigma_client = plot_df["Client"].std()
mu_plc = plot_df["PLC"].mean()
sigma_plc = plot_df["PLC"].std()

print("=== Healthy mode statistics ===")
print(f"Client mean = {mu_client:.2f} bytes")
print(f"Client std  = {sigma_client:.2f} bytes")
print(f"PLC mean    = {mu_plc:.2f} bytes")
print(f"PLC std     = {sigma_plc:.2f} bytes")

# Figure combinée
plt.figure(figsize=(10, 6))
plt.plot(plot_df.index, plot_df["Client"], label="Client/SCADA")
plt.plot(plot_df.index, plot_df["PLC"], label="PLC(OpenPLC)")
plt.title("Healthy Run - Communication Sources (Modbus)")
plt.xlabel("Time [s]")
plt.ylabel("Total load [Bytes]")
plt.legend()
plt.grid(True)
plt.tight_layout()
plt.savefig("healthy_run_openplc_combined.png", dpi=300)
plt.show()

# Figure source client
plt.figure(figsize=(10, 5))
plt.plot(plot_df.index, plot_df["Client"], label="Healthy")
plt.title("SCADA Communication Source")
plt.xlabel("Time [s]")
plt.ylabel("Total load [Bytes]")
plt.legend()
plt.grid(True)
plt.tight_layout()
plt.savefig("healthy_scada_source.png", dpi=300)
plt.show()

# Figure source PLC
plt.figure(figsize=(10, 5))
plt.plot(plot_df.index, plot_df["PLC"], label="Healthy")
plt.title("PLC Communication Source")
plt.xlabel("Time [s]")
plt.ylabel("Total load [Bytes]")
plt.legend()
plt.grid(True)
plt.tight_layout()
plt.savefig("healthy_plc_source.png", dpi=300)
plt.show()

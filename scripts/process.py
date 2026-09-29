"""Loadle curve builder:  python scripts/process.py

Reads raw downloads from data/raw/ and writes data/curves.csv.

For each country: load the raw file, put it on an hour-beginning local-time index in MW,
drop weekends and public holidays, average by hour of day for annual / winter (DJF) /
summer (JJA), normalise to the peak hour, and write one row per curve to curves.csv.
"""
import pandas as pd, numpy as np, json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
U = str(ROOT / "data" / "raw") + "/"
OUT = ROOT / "data" / "curves.csv"

def smard(path):
    df = pd.read_csv(path, sep=";", thousands=",", encoding="utf-8-sig")
    df = df.iloc[:, [0, 2]]; df.columns = ["t", "mw"]
    df["t"] = pd.to_datetime(df["t"], format="%b %d, %Y %I:%M %p")   # hour-beginning, local
    return df.set_index("t")["mw"]

def eia_us48():
    frames = []
    for f in ["USA-Lower48EIA930_BALANCE_2025_Jan_Jun.csv", "USA-Lower48EIA930_BALANCE_2025_Jul_Dec.csv"]:
        d = pd.read_csv(U + f, usecols=["Balancing Authority", "UTC Time at End of Hour", "Demand (MW) (Adjusted)"], thousands=",")
        frames.append(d)
    d = pd.concat(frames)
    d["utc"] = pd.to_datetime(d["UTC Time at End of Hour"], format="%m/%d/%Y %I:%M:%S %p")
    genonly = d.groupby("Balancing Authority")["Demand (MW) (Adjusted)"].apply(lambda s: s.isna().all())
    d = d[~d["Balancing Authority"].isin(genonly[genonly].index)]
    cnt = d.groupby("utc")["Demand (MW) (Adjusted)"].count()
    full = cnt[cnt == cnt.max()].index                       # hours where every demand-reporting BA reported
    tot = d[d.utc.isin(full)].groupby("utc")["Demand (MW) (Adjusted)"].sum()
    idx = (tot.index.tz_localize("UTC").tz_convert("America/New_York") - pd.Timedelta(hours=1)).tz_localize(None)
    return pd.Series(tot.values, index=idx)

def neso_gb():
    d = pd.read_csv(U + "demanddata_2025.csv", usecols=["SETTLEMENT_DATE", "SETTLEMENT_PERIOD", "ND"])
    d["t"] = pd.to_datetime(d.SETTLEMENT_DATE) + pd.to_timedelta((d.SETTLEMENT_PERIOD - 1) * 30, unit="min")  # local clock
    return d.set_index("t")["ND"].resample("h").mean()

def emi_nz():
    d = pd.read_csv(U + "NZ-Demand_trends_20260927075807.csv", skiprows=11)
    d["t"] = pd.to_datetime(d["Period start"], format="%d/%m/%Y %H:%M:%S")
    s = d.set_index("t")["Demand (GWh)"] * 2000                 # GWh per half hour -> MW
    return s.resample("h").mean()

def taipower_tw(year=2021):
    d = pd.read_csv(U + "Taiwan-loadarea_10min_2017Jan_2022Jun.csv", parse_dates=["datetime"])
    d = d[d.datetime.dt.year == year]
    s = d.set_index("datetime")[["south", "north", "east", "central"]].sum(axis=1)
    return s.resample("h").mean()

def nigeria():
    d = pd.read_excel(U + "Nigeria National Demand Timeseries.xlsx", skiprows=4, usecols=[0, 3])
    d.columns = ["t", "mw"]
    d["t"] = pd.to_datetime(d["t"]).dt.round("h")
    return d.set_index("t")["mw"]

HOL = {  # national public holidays in the year(s) covered
 "Germany":   ["2025-01-01","2025-04-18","2025-04-21","2025-05-01","2025-05-29","2025-06-09","2025-10-03","2025-12-25","2025-12-26"],
 "Austria":   ["2025-01-01","2025-01-06","2025-04-21","2025-05-01","2025-05-29","2025-06-09","2025-06-19","2025-08-15","2025-10-26","2025-11-01","2025-12-08","2025-12-25","2025-12-26"],
 "Luxembourg":["2025-01-01","2025-04-21","2025-05-01","2025-05-09","2025-05-29","2025-06-09","2025-06-23","2025-08-15","2025-11-01","2025-12-25","2025-12-26"],
 "United States":["2025-01-01","2025-01-20","2025-02-17","2025-05-26","2025-06-19","2025-07-04","2025-09-01","2025-10-13","2025-11-11","2025-11-27","2025-12-25"],
 "United Kingdom":["2025-01-01","2025-04-18","2025-04-21","2025-05-05","2025-05-26","2025-08-25","2025-12-25","2025-12-26"],
 "New Zealand":["2025-10-27","2025-12-25","2025-12-26","2026-01-01","2026-01-02","2026-02-06","2026-04-03","2026-04-06","2026-04-27","2026-06-01","2026-07-10"],
 "Taiwan":    ["2021-01-01","2021-02-10","2021-02-11","2021-02-12","2021-02-15","2021-02-16","2021-03-01","2021-04-02","2021-04-05","2021-06-14","2021-09-20","2021-09-21","2021-10-11"],
 "Nigeria":   ["2016-01-01","2016-03-25","2016-03-28","2016-05-02","2016-05-30","2016-07-06","2016-07-07","2016-09-12","2016-09-13","2016-10-03","2016-12-26","2016-12-27"],
}
SOURCES = {
 "Germany":   ("SMARD (Bundesnetzagentur), grid load", 2025, "CC-BY 4.0", smard(U+"Germany-Actual_consumption_202501010100_202601020100_Hour.csv")),
 "Austria":   ("SMARD (Bundesnetzagentur), grid load", 2025, "CC-BY 4.0", smard(U+"Austria-Actual_consumption_202501010100_202601020100_Hour(1).csv")),
 "Luxembourg":("SMARD (Bundesnetzagentur), grid load", 2025, "CC-BY 4.0", smard(U+"Luxembourg-Actual_consumption_202501010100_202601020100_Hour.csv")),
 "United States":("EIA-930, sum of balancing-authority adjusted demand (Lower 48), Eastern time", 2025, "Public domain", eia_us48()),
 "United Kingdom":("NESO Data Portal, national demand (ND), GB", 2025, "NESO Open Data Licence", neso_gb()),
 "New Zealand":("Electricity Authority EMI, demand trends by trading period", "2025-09 to 2026-08", "CC-BY 4.0", emi_nz()),
 "Taiwan":    ("Taipower 10-minute load by area, four areas summed", 2021, "check", taipower_tw()),
 "Nigeria":   ("Mendeley Data, reconstructed national unsuppressed demand (no outages)", 2016, "CC-BY 4.0", nigeria()),
}
SOUTH = {"New Zealand"}

def curves(name, s):
    s = s.dropna()
    cal = s.index.floor("D").normalize()
    hol = pd.to_datetime(HOL[name])
    wk = s[(s.index.weekday < 5) & (~cal.isin(hol))]
    m = wk.index.month
    win, sum_ = ([6,7,8],[12,1,2]) if name in SOUTH else ([12,1,2],[6,7,8])
    out = {}
    for label, months in [("annual", range(1,13)), ("winter", win), ("summer", sum_)]:
        sub = wk[m.isin(months)]
        days = sub.index.normalize().nunique()
        if days < 30: continue
        prof = sub.groupby(sub.index.hour).mean().reindex(range(24))
        out[label] = (prof / prof.max()).round(3).tolist(), round(prof.max()/1000, 2), days, prof.idxmax(), round(prof.min()/prof.max(),3)
    return out

rows = []
for name, (src, yr, lic, s) in SOURCES.items():
    print(f"\n{name}: {len(s)} hourly points {s.index.min()} -> {s.index.max()}, peak {s.max()/1000:.1f} GW, NaN {s.isna().sum()}")
    for season, (h, pk, days, pkh, ratio) in curves(name, s).items():
        print(f"  {season:7s} days={days:3d} peak={pk:7.2f} GW @ {pkh:02d}:00  min/peak={ratio}")
        rows.append(dict(country=name, season=season, year=yr, source=src, licence=lic, peak_gw=pk, weekdays_used=days,
                         method="Mon-Fri excluding national public holidays; mean by local hour; normalised to peak hour",
                         **{f"h{i:02d}": h[i] for i in range(24)}))
df = pd.DataFrame(rows)
df.to_csv(OUT, index=False)
print("\nwrote", len(df), "curves")

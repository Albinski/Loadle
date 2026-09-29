"""Build site/data/curves.json from data/curves.csv + data/countries.csv.

    python scripts/build.py          # write the file
    python scripts/build.py --check  # exit 1 if the committed JSON is stale (used by CI)

Every country in curves.csv must have a row in countries.csv, and must have
annual, winter and summer curves. Curves are rounded to 3 dp.
"""
import csv, json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CURVES = ROOT / "data" / "curves.csv"
META = ROOT / "data" / "countries.csv"
OUT = ROOT / "site" / "data" / "curves.json"
HOURS = [f"h{i:02d}" for i in range(24)]

def build():
    meta = {r["country"]: r for r in csv.DictReader(META.open(encoding="utf-8"))}
    countries = {}
    for r in csv.DictReader(CURVES.open(encoding="utf-8")):
        name = r["country"]
        if name not in meta:
            sys.exit(f"{name} is in curves.csv but has no row in countries.csv")
        m = meta[name]
        c = countries.setdefault(name, {
            "n": name, "lat": float(m["lat"]), "lon": float(m["lon"]), "cont": m["continent"],
            "season": m["peak_season"], "src": m["main_source"], "why": m["blurb"],
            "source": r["source"], "year": r["year"], "licence": r["licence"],
            "pk": {}, "curves": {},
        })
        c["curves"][r["season"]] = [round(float(r[h]), 3) for h in HOURS]
        c["pk"][r["season"]] = float(r["peak_gw"])
    for c in countries.values():
        missing = {"annual", "winter", "summer"} - set(c["curves"])
        if missing:
            sys.exit(f"{c['n']} is missing curves: {sorted(missing)}")
        peak = max(c["pk"].values()); lo = min(c["pk"].values())
        c["peak"] = f"{lo:g}–{peak:g} GW" if peak - lo > 0.05 * peak else f"~{peak:g} GW"
    out = {"generated_from": ["data/curves.csv", "data/countries.csv"],
           "licence": "CC-BY 4.0", "countries": sorted(countries.values(), key=lambda c: c["n"])}
    return json.dumps(out, ensure_ascii=False, indent=1) + "\n"

if __name__ == "__main__":
    text = build()
    if "--check" in sys.argv:
        if not OUT.exists() or OUT.read_text(encoding="utf-8") != text:
            sys.exit("site/data/curves.json is stale — run: python scripts/build.py")
        print("curves.json is up to date")
    else:
        OUT.write_text(text, encoding="utf-8")
        n = len(json.loads(text)["countries"])
        print(f"wrote {OUT.relative_to(ROOT)} with {n} countries ({n*2} seasonal puzzles)")

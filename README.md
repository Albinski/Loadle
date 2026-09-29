# Loadle

A daily puzzle: you're shown a country's typical weekday electricity demand curve and have six guesses to name the country. Wordle for grid nerds.

**Play:** https://loadle.app

## How it works

- `site/` is the whole website: static HTML, CSS and JavaScript, no backend. It loads `site/data/curves.json` at startup.
- `data/curves.csv` is the dataset: one row per country and season (annual, winter, summer), 24 hourly values normalised to the peak hour, with the source, year and licence of every curve. `data/countries.csv` holds each country's metadata and reveal text.
- `scripts/process.py` turns raw downloads into `curves.csv`.
- `scripts/build.py` merges the two CSVs into `curves.json`. CI fails if the JSON is out of date.

## Run locally

```bash
python -m http.server 8000 --directory site
# open http://localhost:8000
```

(The page fetches `curves.json`, so it needs a web server rather than opening the file directly.)

## Rebuilding the site data

`curves.csv` and `countries.csv` are the source of truth and are committed. To regenerate the JSON the site uses:

```bash
python scripts/build.py
```

## Reprocessing from raw data

The raw downloads are **not** in the repository: they're large (the US files alone are ~100 MB), and they belong to their publishers rather than to this project. `scripts/process.py` documents exactly how each curve was derived and will recreate `curves.csv` if you place the original files in `data/raw/`. The table below says where each came from.

| Country | Source | Year | Resolution | Licence |
|---|---|---|---|---|
| Germany, Austria, Luxembourg | SMARD (Bundesnetzagentur), "Actual consumption" export, grid load | 2025 | hourly | CC BY 4.0 |
| United States (Lower 48) | EIA-930 six-month balance files, adjusted demand summed over balancing authorities, shown in Eastern time | 2025 | hourly | Public domain |
| United Kingdom (GB) | NESO Data Portal, historic demand data, ND | 2025 | half-hourly | NESO Open Data Licence |
| New Zealand | Electricity Authority EMI, demand trends by trading period | Sep 2025 – Aug 2026 | half-hourly | CC BY 4.0 |
| Taiwan | Taipower load by area (four areas summed) | 2021 | 10-minute | CC BY 4.0 |
| Nigeria | Mendeley Data, reconstructed national unsuppressed demand | 2016 | hourly | CC BY 4.0 |

```bash
pip install -r scripts/requirements.txt
python scripts/process.py   # data/raw/* -> data/curves.csv
python scripts/build.py     # curves.csv + countries.csv -> site/data/curves.json
```

## Method

For each country and season: Monday to Friday only, national public holidays removed, mean demand by local hour, divided by the peak hour. Winter is December–February and summer June–August in the northern hemisphere, swapped for the southern hemisphere. Times are the country's local time, with DST handled by the source data. Sub-hourly data is averaged within the hour, not sampled.

## Adding a country

See [CONTRIBUTING.md](CONTRIBUTING.md). Contributions of new countries are very welcome.

## AI declaration

Loadle was designed and directed by its maintainer (github.com/Albinski). The game code, the processing scripts and some of this documentation were written with the assistance of Claude (Anthropic). No AI-generated data is used: every curve is computed from the published source listed above.

## Licences

Code: MIT (see `LICENSE`). Dataset: CC BY 4.0 (see `data/LICENSE-DATA`).

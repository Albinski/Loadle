# Adding a country to Loadle

Every country needs three curves (annual, winter, summer) and one row of metadata. The easiest route is to add a loader to `scripts/process.py`; the script does the rest.

## 1. Find the data

You need at least one full year of national (or grid-wide) electricity demand at hourly or finer resolution, in local time or with a known time zone, from a source that allows redistribution (CC BY, public domain, or an equivalent open licence). System operators and regulators are the usual sources. A good index is https://github.com/open-energy-transition/awesome-electricity-demand.

Please don't add sources that are "personal use only", "non-commercial" or "access on request" unless you have written permission to redistribute a derived curve.

## 2. Add a loader

In `scripts/process.py`, write a function that returns a `pandas.Series` of demand in **MW** indexed by **hour-beginning local time** (a naive `DatetimeIndex`), and add it to `SOURCES` with the source name, year and licence. Add the country's national public holidays for that year to `HOL`. If the country is in the southern hemisphere, add it to `SOUTH`.

Watch for: timestamps that mark the end of the hour (subtract one hour), UTC timestamps (convert), half-hourly or 5-minute data (average within the hour, don't sample), and multi-time-zone countries (pick one zone and say which).

Put the raw file in `data/raw/` (it's git-ignored; record where it came from in the source string).

## 3. Add metadata

Add one row to `data/countries.csv`:

| column | meaning |
|---|---|
| `country` | must match the name used in `site/js/world.js` |
| `lat`, `lon` | centroid, for the distance/direction hints |
| `continent` | Europe, Asia, Africa, North America, South America, Oceania |
| `peak_season` | `winter`, `summer` or `flat` |
| `main_source` | largest generation source(s), a few words |
| `blurb` | two or three sentences explaining the shape, shown after the puzzle is solved |

## 4. Build and check

```bash
python scripts/process.py
python scripts/build.py
python -m http.server 8000 --directory site
```

Play a few practice rounds and check the curve looks right. Then open a pull request with the CSV changes, the loader, and a sentence about the source.

"""Country-level context features, from public APIs (cached under data/raw/).

  * INFORM Risk (JRC), latest default release: Vulnerability (VU) and
    Lack of Coping Capacity (CC), 0-10 per ISO3.
  * World Bank SP.POP.TOTL: total population, latest value per ISO3.
"""
from __future__ import annotations

from pathlib import Path

import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw"
INFORM_CSV = RAW / "inform_risk_vu_cc.csv"
POP_CSV = RAW / "worldbank_population.csv"
INFORM_API = "https://drmkc.jrc.ec.europa.eu/inform-index/API/InformAPI"
WB_URL = ("https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL"
          "?format=json&mrnev=1&per_page=400")


def inform_vu_cc() -> pd.DataFrame:
    if not INFORM_CSV.exists():
        wf = requests.get(f"{INFORM_API}/Workflows/Default", timeout=120).json()
        rows = requests.get(f"{INFORM_API}/Countries/Scores/",
                            params={"WorkflowId": wf["WorkflowId"], "IndicatorId": "VU,CC"},
                            timeout=300).json()
        df = (pd.DataFrame(rows).pivot_table(index="Iso3", columns="IndicatorId",
                                             values="IndicatorScore").reset_index())
        df.columns = ["iso3", "inform_cc", "inform_vu"]
        df["inform_release"] = wf["Name"]
        RAW.mkdir(parents=True, exist_ok=True)
        df.to_csv(INFORM_CSV, index=False)
    return pd.read_csv(INFORM_CSV)


def population() -> pd.DataFrame:
    if not POP_CSV.exists():
        rows = requests.get(WB_URL, timeout=120).json()[1]
        pd.DataFrame([{"iso3": r["countryiso3code"], "population": r["value"],
                       "population_year": r["date"]} for r in rows
                      if r["countryiso3code"]]).to_csv(POP_CSV, index=False)
    return pd.read_csv(POP_CSV)[["iso3", "population"]]


def country_table() -> pd.DataFrame:
    """iso3 -> inform_vu, inform_cc, population (NaN where a source has no value)."""
    return inform_vu_cc()[["iso3", "inform_vu", "inform_cc"]].merge(
        population(), on="iso3", how="outer")

"""
Approximate country centres for the globe dots (ISO3 -> lat, lng).
Covers every country in data/processed/ranked_risks.json; countries missing here get no dot.
"""

COUNTRY_CENTRES = {
    "AFG": (33.9, 67.7),
    "CMR": (7.4, 12.4),
    "COL": (4.6, -74.3),
    "ETH": (9.1, 40.5),
    "IDN": (-2.5, 118.0),
    "KEN": (0.0, 37.9),
    "MDG": (-18.8, 46.9),
    "MLI": (17.6, -4.0),
    "MMR": (21.9, 95.96),
    "MOZ": (-18.7, 35.5),
    "NER": (17.6, 8.1),
    "NGA": (9.1, 8.7),
    "PHL": (12.9, 121.8),
    "PSE": (31.9, 35.2),
    "SDN": (12.86, 30.22),
    "SSD": (6.88, 31.31),
    "SYR": (34.8, 39.0),
    "TCD": (15.45, 18.73),
    "YEM": (15.55, 48.52),
}

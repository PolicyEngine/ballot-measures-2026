"""Geography of the states with modeled measures.

Congressional district geoids follow the dataset's SSDD encoding: state
FIPS x 100 + district number (Colorado's 1st district is 801). At-large
states (North Dakota, South Dakota) carry a single geoid and get no
district view.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class StateGeo:
    code: str
    name: str
    fips: int
    # Every congressional_district_geoid the subset must contain.
    district_geoids: tuple[int, ...]
    # Plausible household-record counts for the subset (sanity check).
    min_households: int
    max_households: int

    @property
    def has_districts(self) -> bool:
        return len(self.district_geoids) > 1

    def district_label(self, geoid: int) -> str:
        """``CO-01`` style label; at-large states use ``ND-AL``."""
        if not self.has_districts:
            return f"{self.code}-AL"
        return f"{self.code}-{geoid % 100:02d}"


STATES: dict[str, StateGeo] = {
    "CA": StateGeo(
        code="CA",
        name="California",
        fips=6,
        district_geoids=tuple(range(601, 653)),
        min_households=50_000,
        max_households=600_000,
    ),
    "CO": StateGeo(
        code="CO",
        name="Colorado",
        fips=8,
        district_geoids=tuple(range(801, 809)),
        min_households=10_000,
        max_households=200_000,
    ),
    "ND": StateGeo(
        code="ND",
        name="North Dakota",
        fips=38,
        # At-large; the subset check confirms the encoding.
        district_geoids=(3800,),
        min_households=1_000,
        max_households=50_000,
    ),
    "SD": StateGeo(
        code="SD",
        name="South Dakota",
        fips=46,
        district_geoids=(4600,),
        min_households=1_000,
        max_households=50_000,
    ),
    "WA": StateGeo(
        code="WA",
        name="Washington",
        fips=53,
        district_geoids=tuple(range(5301, 5311)),
        min_households=10_000,
        max_households=200_000,
    ),
}

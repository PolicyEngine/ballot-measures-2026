"""Calculations behind the 2026 ballot measures dashboard.

The measure registry (``ballot_calc.measures``) defines each measure's
current-law and passes policies; the pipeline, the household API and the
frontend export all read it. Impact everywhere = (measure passes) -
(current law).
"""

from .config import POLICYENGINE_US_PIN
from .measures import MEASURE_SLUGS, MEASURES, Measure

__all__ = ["MEASURES", "MEASURE_SLUGS", "Measure", "POLICYENGINE_US_PIN"]

__version__ = "2.0.0"

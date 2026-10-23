"""Income tax measures (CO Amendment 87, CA Proposition 3, WA I-645).

Tax-unit reducers over the measure's state income tax variable (its
``target_variable``). Tax changes are signed from the taxpayer's side:
positive = the tax unit pays more when the measure passes.
"""

from __future__ import annotations

import numpy as np

from ..config import CHANGE_THRESHOLD
from .core import weighted_sum

AGI_TOP = 1_000_000

METRICS: tuple[str, ...] = (
    "tax_units_paying_more",
    "tax_units_paying_less",
    "avg_tax_change_paying_more",
    "avg_tax_change_paying_less",
    "revenue_share_agi_1m_plus",
    "baseline_state_income_tax",
)


def income_tax_metrics(base: dict, reform: dict, threshold=CHANGE_THRESHOLD) -> dict:
    w = np.asarray(base["tu_weight"], dtype=float)
    tax_base = np.asarray(base["tu_state_tax"], dtype=float)
    delta = np.asarray(reform["tu_state_tax"], dtype=float) - tax_base
    agi = np.asarray(base["tu_agi"], dtype=float)
    more = delta > threshold
    less = delta < -threshold
    paying_more = float(w[more].sum())
    paying_less = float(w[less].sum())
    total = weighted_sum(delta, w)
    return {
        "tax_units_paying_more": paying_more,
        "tax_units_paying_less": paying_less,
        "avg_tax_change_paying_more": weighted_sum(delta, w, more) / paying_more
        if paying_more
        else 0.0,
        "avg_tax_change_paying_less": weighted_sum(delta, w, less) / paying_less
        if paying_less
        else 0.0,
        # Share of the total change in state income tax that comes from tax
        # units with baseline AGI of $1 million or more.
        "revenue_share_agi_1m_plus": weighted_sum(delta, w, agi >= AGI_TOP) / total
        if total
        else 0.0,
        "baseline_state_income_tax": weighted_sum(tax_base, w),
    }

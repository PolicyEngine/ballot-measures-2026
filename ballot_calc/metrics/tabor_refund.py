"""Colorado Proposition NN: the TABOR sales tax refund current law pays.

Refunds are tax-unit amounts (joint returns get two per-person amounts).
"""

from __future__ import annotations

import numpy as np

from .core import weighted_sum

METRICS: tuple[str, ...] = (
    "refund_total_baseline",
    "refund_recipients_baseline",
    "avg_refund_baseline",
)


def tabor_refund_metrics(base: dict, reform: dict) -> dict:
    w = np.asarray(base["tu_weight"], dtype=float)
    refund = np.asarray(base["tu_refund"], dtype=float)
    recipients = float(w[refund > 0].sum())
    total = weighted_sum(refund, w)
    return {
        "refund_total_baseline": total,
        # Tax units receiving a refund under current law.
        "refund_recipients_baseline": recipients,
        "avg_refund_baseline": total / recipients if recipients else 0.0,
    }

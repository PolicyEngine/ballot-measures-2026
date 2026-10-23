"""IRS SOI coverage and coverage-scaled revenue (metrics/top_tail.py)."""

from __future__ import annotations

import numpy as np
import pytest

from ballot_calc.metrics.top_tail import (
    SOI,
    coverage,
    coverage_scaled_change,
    scale_factors,
    state_summary,
    tabulate,
)


def test_soi_above_threshold_income():
    for figures in SOI.values():
        assert figures["agi_above_1m"] == pytest.approx(
            figures["agi_1m_plus"] - 1e6 * figures["returns_1m_plus"]
        )
        assert 0 < figures["agi_above_1m"] < figures["agi_1m_plus"]
    # TY2023 Historic Table 2: CO $1M+ returns and AGI.
    assert SOI["CO"]["returns_1m_plus"] == 15_610
    assert SOI["CO"]["agi_1m_plus"] == 47_266_883_000


def test_tabulate_bands():
    agi = np.array([100e3, 600e3, 1.5e6, 3e6])
    weight = np.array([10.0, 2.0, 1.0, 1.0])
    tab = tabulate(agi, weight)
    assert tab["returns"] == 14
    assert tab["returns_500k_1m"] == 2
    assert tab["agi_500k_1m"] == pytest.approx(1.2e6)
    assert tab["returns_1m_plus"] == 2
    assert tab["agi_1m_plus"] == pytest.approx(4.5e6)
    assert tab["agi_above_1m"] == pytest.approx(0.5e6 + 2e6)
    assert tab["records_1m_plus"] == 2


def test_scaled_change_matches_soi_when_coverage_is_exact():
    """With the model's tail equal to SOI's, scaling changes nothing."""
    soi = SOI["WA"]
    model = dict(soi)
    scale = scale_factors(model, soi)
    assert scale == pytest.approx(
        {"500k_1m": 1.0, "1m_plus_returns": 1.0, "1m_plus_above": 1.0}
    )
    agi = np.array([2e5, 7e5, 2e6])
    weight = np.ones(3)
    delta = np.array([0.0, 0.0, -0.099 * 1e6])
    out = coverage_scaled_change(agi, weight, delta, -0.099, scale)
    assert out["scaled"] == pytest.approx(delta.sum())
    assert out["above_threshold"] == pytest.approx(-0.099 * 1e6)
    assert out["at_threshold"] == pytest.approx(0.0)


def test_scaled_change_splits_the_top_band():
    # Model: twice SOI's $1M+ returns, half its income above $1M.
    soi = SOI["CO"]
    model = dict(soi)
    model["returns_1m_plus"] = 2 * soi["returns_1m_plus"]
    model["agi_above_1m"] = 0.5 * soi["agi_above_1m"]
    scale = scale_factors(model, soi)
    assert scale["1m_plus_returns"] == pytest.approx(0.5)
    assert scale["1m_plus_above"] == pytest.approx(2.0)
    # One $3M tax unit: 4% on $2M above the threshold, plus $1,000 paid at it.
    agi = np.array([3e6])
    delta = np.array([0.04 * 2e6 + 1_000])
    out = coverage_scaled_change(agi, np.ones(1), delta, 0.04, scale)
    assert out["above_threshold"] == pytest.approx(80_000)
    assert out["at_threshold"] == pytest.approx(1_000)
    assert out["scaled"] == pytest.approx(80_000 * 2 + 1_000 * 0.5)


def test_state_summary():
    tab = dict(SOI["CA"])
    summary = state_summary("CA", tab)
    assert summary["filer_year"] == 2024
    assert summary["soi_year"] == 2023
    assert coverage(tab, SOI["CA"])["returns_1m_plus"] == pytest.approx(1.0)
    assert summary["coverage"]["agi_above_1m"] == pytest.approx(1.0)

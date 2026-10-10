from decimal import Decimal

import pytest

from whatif_engine.domain.models import JobOffer, LivingCosts


def test_living_cost_total():
    costs = LivingCosts(
        monthly_rent=Decimal("10000"),
        monthly_utilities=Decimal("2000"),
        monthly_food=Decimal("5000"),
        monthly_transport=Decimal("1500"),
        monthly_other=Decimal("500"),
    )
    assert costs.total_monthly == Decimal("19000")


def test_negative_salary_is_rejected():
    with pytest.raises(ValueError):
        JobOffer(annual_take_home=Decimal("-1"))


def test_negative_living_cost_is_rejected():
    with pytest.raises(ValueError):
        LivingCosts(
            monthly_rent=Decimal("-1"),
            monthly_utilities=Decimal("0"),
            monthly_food=Decimal("0"),
            monthly_transport=Decimal("0"),
        )

from backend.services.ssid_service.connector import AsyncPocketOptionWrapper
from backend.services.ssid_service.routes import validate_ssid_format


def test_validate_ssid_format_rejects_empty():
    ok, message = validate_ssid_format("")
    assert ok is False
    assert "non-empty" in message


def test_validate_ssid_format_accepts_valid_payload():
    payload = '42["auth",{"session":"' + ("a" * 80) + '","isDemo":1,"uid":123,"platform":2}]'
    ok, message = validate_ssid_format(payload)
    assert ok is True
    assert message == "ok"


def test_extract_order_id_from_nested_payload_shapes():
    wrapper = object.__new__(AsyncPocketOptionWrapper)
    payload = {
        "result": {
            "order": {
                "ticket": "T-12345"
            }
        }
    }

    extracted = AsyncPocketOptionWrapper._extract_order_id(wrapper, payload)
    assert extracted == "T-12345"

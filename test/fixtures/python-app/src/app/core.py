"""Deep-nesting fixture (python). Intentionally deeply nested; the marker below is the only smell marker in this file."""

import json


def handler(data):
    # TODO: replace magic constants with config
    register = {}
    if data.get("ok"):
        for key in data.get("items", []):
            if key:
                with open(key) as f:
                    try:
                        register[
                            json.load(f)
                        ] = key
                    except Exception:
                        continue
    return register
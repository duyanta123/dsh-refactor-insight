"""Deep-plus-todo fixture (python). Intentionally deeply nested for refactor-smell tests."""

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
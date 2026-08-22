"""God-object fixture (python). MonolithService intentionally has >10 methods."""


class MonolithService:
    """Accumulates too many unrelated responsibilities."""

    def method_01(self):
        return 1

    def method_02(self):
        return 2

    def method_03(self):
        return 3

    def method_04(self):
        return 4

    def method_05(self):
        return 5

    def method_06(self):
        return 6

    def method_07(self):
        return 7

    def method_08(self):
        return 8

    def method_09(self):
        return 9

    def method_10(self):
        return 10

    def method_11(self):
        return 11

    def method_12(self):
        return 12


class TinyService:
    """Small, healthy class — must not trigger god-object."""

    def ping(self):
        return "pong"
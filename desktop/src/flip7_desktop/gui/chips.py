from PySide6.QtCore import Signal
from PySide6.QtWidgets import QPushButton


class ChipButton(QPushButton):
    """A QPushButton that also reports double-clicks, used by the pool
    chips (double-click = steal the card straight into the line)."""

    doubleClicked = Signal()

    def mouseDoubleClickEvent(self, event):
        super().mouseDoubleClickEvent(event)
        self.doubleClicked.emit()


def make_chip_button(text: str, on_click, object_name: str | None = None) -> QPushButton:
    """A small, content-sized push button wired to a no-argument callback."""
    btn = ChipButton(text)
    if object_name:
        btn.setObjectName(object_name)
    btn.clicked.connect(on_click)
    return btn


def make_held_card_chip(text: str, on_click) -> QPushButton:
    btn = make_chip_button(text, on_click)
    btn.setProperty("chipRole", "held")
    return btn


def make_pool_number_button(text: str, on_click, selected: bool = False, on_double_click=None) -> QPushButton:
    btn = make_chip_button(text, on_click)
    btn.setProperty("chipRole", "poolSelected" if selected else "pool")
    if on_double_click is not None:
        btn.doubleClicked.connect(on_double_click)
    return btn


def make_pool_badge(text: str, on_click) -> QPushButton:
    btn = make_chip_button(text, on_click)
    btn.setProperty("chipRole", "badge")
    return btn

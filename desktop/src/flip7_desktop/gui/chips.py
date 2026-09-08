from PySide6.QtWidgets import QPushButton


def make_chip_button(text: str, on_click, object_name: str | None = None) -> QPushButton:
    """A small, content-sized push button wired to a no-argument callback."""
    btn = QPushButton(text)
    if object_name:
        btn.setObjectName(object_name)
    btn.clicked.connect(on_click)
    return btn


def make_held_card_chip(text: str, on_click) -> QPushButton:
    btn = make_chip_button(text, on_click)
    btn.setProperty("chipRole", "held")
    return btn


def make_pool_number_button(text: str, on_click, selected: bool = False) -> QPushButton:
    btn = make_chip_button(text, on_click)
    btn.setProperty("chipRole", "poolSelected" if selected else "pool")
    return btn


def make_pool_badge(text: str, on_click) -> QPushButton:
    btn = make_chip_button(text, on_click)
    btn.setProperty("chipRole", "badge")
    return btn

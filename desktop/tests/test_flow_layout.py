from PySide6.QtWidgets import QWidget, QPushButton

from flip7_desktop.gui.flow_layout import FlowLayout


def test_flow_layout_holds_added_widgets(qapp):
    container = QWidget()
    layout = FlowLayout(container)
    layout.addWidget(QPushButton("A"))
    layout.addWidget(QPushButton("B"))
    assert layout.count() == 2


def test_flow_layout_clear_removes_all_items(qapp):
    container = QWidget()
    layout = FlowLayout(container)
    layout.addWidget(QPushButton("A"))
    layout.addWidget(QPushButton("B"))
    layout.clear()
    assert layout.count() == 0

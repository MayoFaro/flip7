import sys

from PySide6.QtWidgets import QApplication

from .gui.main_window import MainWindow

STYLE_SHEET = """
QPushButton {
    padding: 1px 5px;
    min-width: 0px;
    font-size: 9pt;
}
QPushButton[chipRole="held"] {
    border-radius: 10px;
    padding: 2px 8px;
}
QPushButton[chipRole="poolSelected"] {
    background-color: #f4c95d;
    font-weight: bold;
}
QPushButton[chipRole="badge"] {
    border: 1px solid #d98a5f;
    color: #7a4a26;
}
"""


def main():
    app = QApplication(sys.argv)
    app.setStyleSheet(STYLE_SHEET)
    window = MainWindow()
    window.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()

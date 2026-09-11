from flip7_desktop.gui.chips import make_chip_button, make_held_card_chip, make_pool_number_button, make_pool_badge


def test_make_chip_button_wires_click_callback(qapp):
    calls = []
    btn = make_chip_button("5", lambda: calls.append(True))
    btn.click()
    assert calls == [True]


def test_make_pool_number_button_marks_selected(qapp):
    btn = make_pool_number_button("9 (2)", lambda: None, selected=True)
    assert btn.property("chipRole") == "poolSelected"


def test_make_pool_number_button_wires_double_click_callback(qapp):
    calls = []
    btn = make_pool_number_button("9 (2)", lambda: None, on_double_click=lambda: calls.append(True))
    btn.doubleClicked.emit()
    assert calls == [True]


def test_make_held_card_chip_role(qapp):
    btn = make_held_card_chip("5", lambda: None)
    assert btn.property("chipRole") == "held"


def test_make_pool_badge_role(qapp):
    btn = make_pool_badge("-2 (1)", lambda: None)
    assert btn.property("chipRole") == "badge"

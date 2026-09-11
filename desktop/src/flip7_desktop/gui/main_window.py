from functools import partial
from pathlib import Path

from PySide6.QtCore import Qt, QEvent
from PySide6.QtWidgets import (
    QMainWindow,
    QWidget,
    QVBoxLayout,
    QHBoxLayout,
    QGroupBox,
    QLabel,
    QPushButton,
    QMessageBox,
)

from ..deck import CARD_VALUES, SHOE_BASE, MODIFIER_TYPES, ACTION_TYPES
from ..app_state import AppStateManager, SwapBlocked, card_label
from ..shoe import remaining_count
from .. import storage
from .flow_layout import FlowLayout
from .chips import make_chip_button, make_held_card_chip, make_pool_number_button, make_pool_badge


def is_special_number_card(value: int, kind: str) -> bool:
    return value in (0, 7, 13) and kind == "special"


class MainWindow(QMainWindow):
    def __init__(self, state_path: Path | None = None):
        super().__init__()
        self.setWindowTitle("Flip 7")
        self.setWindowFlag(Qt.WindowType.WindowStaysOnTopHint, True)

        self.state_path = state_path if state_path is not None else storage.DEFAULT_STATE_PATH
        state = storage.load_state(self.state_path)
        self.manager = AppStateManager(
            seen=state.seen, line=state.line, round_seen=state.round_seen, recent_cards=state.recent_cards
        )

        self.seen_buttons = {}
        self.line_buttons = {}
        self.special_buttons = {}

        central = QWidget()
        central.installEventFilter(self)
        self.setCentralWidget(central)
        root = QVBoxLayout(central)

        root.addLayout(self._build_title_bar())
        root.addLayout(self._build_status_bar())

        columns = QHBoxLayout()
        columns.addWidget(self._build_seen_group(), 1)
        columns.addWidget(self._build_line_group(), 1)
        columns.addWidget(self._build_pool_group(), 1)
        root.addLayout(columns)

        self.render()

    # -- construction -----------------------------------------------

    def _build_title_bar(self):
        row = QHBoxLayout()
        title = QLabel("Flip 7")
        title.setStyleSheet("font-size: 16pt; font-weight: bold;")
        self.deck_count_label = QLabel("–")
        self.deck_count_label.setStyleSheet("font-size: 22pt; font-weight: bold; color: #d99a00;")
        row.addWidget(title)
        row.addStretch(1)
        row.addWidget(self.deck_count_label)
        return row

    def _build_status_bar(self):
        row = QHBoxLayout()
        self.bust_label = QLabel("Bust : – %")
        self.recommendation_label = QLabel("–")
        self.recommendation_label.setStyleSheet("font-size: 14pt; font-weight: bold;")
        self.recent_label = QLabel("–")
        row.addWidget(self.bust_label)
        row.addWidget(self.recommendation_label)
        row.addWidget(self.recent_label, 1)

        undo_btn = QPushButton("Annuler")
        undo_btn.clicked.connect(self._on_undo)
        round_btn = QPushButton("Round")
        round_btn.clicked.connect(self._on_new_round)
        reshuffle_btn = QPushButton("Reshuffle")
        reshuffle_btn.clicked.connect(self._on_reshuffle)
        game_btn = QPushButton("Partie")
        game_btn.clicked.connect(self._on_new_game)
        for btn in (undo_btn, round_btn, reshuffle_btn, game_btn):
            row.addWidget(btn)
        return row

    def _build_seen_group(self):
        group = QGroupBox("Autres joueurs")
        outer = QVBoxLayout(group)
        columns = QHBoxLayout()
        numbers_col = QVBoxLayout()
        specials_col = QVBoxLayout()
        for v in CARD_VALUES:
            for kind in ("regular", "special"):
                if SHOE_BASE[v][kind] == 0:
                    continue
                btn = make_chip_button(card_label(v, kind), partial(self._on_log_other_player_card, v, kind))
                self.seen_buttons[(v, kind)] = btn
                (specials_col if is_special_number_card(v, kind) else numbers_col).addWidget(btn)
        self._append_special_card_buttons(specials_col)
        numbers_col.addStretch(1)
        specials_col.addStretch(1)
        columns.addLayout(numbers_col)
        columns.addLayout(specials_col)
        outer.addLayout(columns)
        return group

    def _build_line_group(self):
        group = QGroupBox("Ma ligne")
        outer = QVBoxLayout(group)
        outer.addWidget(QLabel("Actuelle"))
        my_cards_container = QWidget()
        self.my_cards_layout = FlowLayout(my_cards_container)
        outer.addWidget(my_cards_container)

        outer.addWidget(QLabel("Ajouter"))
        columns = QHBoxLayout()
        numbers_col = QVBoxLayout()
        specials_col = QVBoxLayout()
        for v in CARD_VALUES:
            for kind in ("regular", "special"):
                if SHOE_BASE[v][kind] == 0:
                    continue
                btn = make_chip_button(card_label(v, kind), partial(self._on_log_my_card, v, kind))
                self.line_buttons[(v, kind)] = btn
                (specials_col if is_special_number_card(v, kind) else numbers_col).addWidget(btn)
        self._append_special_card_buttons(specials_col)
        numbers_col.addStretch(1)
        specials_col.addStretch(1)
        columns.addLayout(numbers_col)
        columns.addLayout(specials_col)
        outer.addLayout(columns)
        return group

    def _append_special_card_buttons(self, layout):
        for type_id, type_def in MODIFIER_TYPES.items():
            btn = make_chip_button(type_def["label"], partial(self._on_log_special_card, "modifier", type_id))
            self.special_buttons.setdefault(("modifier", type_id), []).append(btn)
            layout.addWidget(btn)
        for type_id, type_def in ACTION_TYPES.items():
            btn = make_chip_button(type_def["label"], partial(self._on_log_special_card, "action", type_id))
            self.special_buttons.setdefault(("action", type_id), []).append(btn)
            layout.addWidget(btn)

    def _build_pool_group(self):
        group = QGroupBox("Échange")
        outer = QVBoxLayout(group)
        pool_container = QWidget()
        self.pool_layout = FlowLayout(pool_container)
        outer.addWidget(pool_container)
        return group

    # -- click handlers -----------------------------------------------

    def _on_log_other_player_card(self, value, kind):
        try:
            self.manager.log_other_player_card(value, kind)
        except ValueError as err:
            QMessageBox.warning(self, "Flip 7", str(err))
            return
        self._save_and_render()

    def _on_log_my_card(self, value, kind):
        try:
            self.manager.log_my_card(value, kind)
        except ValueError as err:
            QMessageBox.warning(self, "Flip 7", str(err))
            return
        self._save_and_render()

    def _on_log_special_card(self, category, type_id):
        try:
            self.manager.log_special_card(category, type_id)
        except ValueError as err:
            QMessageBox.warning(self, "Flip 7", str(err))
            return
        self._save_and_render()

    def _on_my_card_clicked(self, value):
        try:
            self.manager.my_card_click(value)
        except SwapBlocked as err:
            QMessageBox.warning(self, "Flip 7", str(err))
        self._save_and_render()

    def _on_pool_number_clicked(self, value, kind):
        self.manager.pending_pool_selection = (value, kind)
        self.render()

    def _on_pool_number_double_clicked(self, value, kind):
        try:
            self.manager.steal_pool_card(value, kind)
        except SwapBlocked as err:
            QMessageBox.warning(self, "Flip 7", str(err))
            self.render()
            return
        self._save_and_render()

    def _on_claim_pool_modifier(self, category, type_id):
        self.manager.claim_pool_modifier(category, type_id)
        self._save_and_render()

    def _on_undo(self):
        self.manager.undo()
        self._save_and_render()

    def _on_new_round(self):
        self.manager.new_round()
        self._save_and_render()

    def _on_reshuffle(self):
        self.manager.reshuffle()
        self._save_and_render()

    def _on_new_game(self):
        self.manager.new_game()
        self._save_and_render()

    # -- click-outside cancels a pending pool selection ----------------

    def eventFilter(self, obj, event):
        if event.type() == QEvent.Type.MouseButtonPress and self.manager.pending_pool_selection is not None:
            self.manager.pending_pool_selection = None
            self.render()
        return super().eventFilter(obj, event)

    # -- persistence + rendering ---------------------------------------

    def _save_and_render(self):
        storage.save_state(
            storage.AppState(
                seen=self.manager.seen,
                line=self.manager.line,
                round_seen=self.manager.round_seen,
                recent_cards=self.manager.recent_cards,
            ),
            self.state_path,
        )
        self.render()

    def render(self):
        result = self.manager.recommendation()
        self.bust_label.setText(f"Bust : {result.probabilities['bust'] * 100:.1f} %")
        self.recommendation_label.setText(result.action)
        self.recommendation_label.setStyleSheet(
            "font-size: 14pt; font-weight: bold; color: #c0392b;"
            if result.action == "BUSTED"
            else "font-size: 14pt; font-weight: bold;"
        )
        self.deck_count_label.setText(str(result.buckets.d))
        self.recent_label.setText(
            ", ".join(reversed(self.manager.recent_cards)) if self.manager.recent_cards else "–"
        )

        for (v, kind), btn in self.seen_buttons.items():
            btn.setDisabled(remaining_count(self.manager.seen, v, kind) == 0)
        for (v, kind), btn in self.line_buttons.items():
            btn.setDisabled(self.manager.line.busted or remaining_count(self.manager.seen, v, kind) == 0)
        for (category, type_id), buttons in self.special_buttons.items():
            key = "modifier_types" if category == "modifier" else "action_types"
            type_def = MODIFIER_TYPES[type_id] if category == "modifier" else ACTION_TYPES[type_id]
            disabled = self.manager.seen[key][type_id] >= type_def["max"]
            for btn in buttons:
                btn.setDisabled(disabled)

        self._render_my_cards()
        self._render_pool()

    def _render_my_cards(self):
        self.my_cards_layout.clear()
        for chip_value, label in self._held_card_chips():
            btn = make_held_card_chip(label, partial(self._on_my_card_clicked, chip_value))
            self.my_cards_layout.addWidget(btn)

    def _held_card_chips(self):
        chips = []
        for v in self.manager.line.values:
            if v == 7:
                chips.append((7, card_label(7, self.manager.line.seven_kind)))
            elif v == 13:
                if self.manager.line.has_regular_13 and self.manager.line.has_lucky_13:
                    chips.append((13, "13 (+ Chance)"))
                elif self.manager.line.has_lucky_13:
                    chips.append((13, card_label(13, "special")))
                else:
                    chips.append((13, card_label(13, "regular")))
            else:
                chips.append((v, card_label(v, "regular")))
        return chips

    def _render_pool(self):
        self.pool_layout.clear()
        for v in CARD_VALUES:
            for kind in ("regular", "special"):
                if SHOE_BASE[v][kind] == 0:
                    continue
                available = self.manager.pool_available(v, kind)
                if available <= 0:
                    continue
                selected = self.manager.pending_pool_selection == (v, kind)
                btn = make_pool_number_button(
                    f"{card_label(v, kind)} ({available})",
                    partial(self._on_pool_number_clicked, v, kind),
                    selected=selected,
                    on_double_click=partial(self._on_pool_number_double_clicked, v, kind),
                )
                self.pool_layout.addWidget(btn)
        for type_id, type_def in MODIFIER_TYPES.items():
            count = self.manager.round_seen["modifier_types"][type_id]
            if count <= 0:
                continue
            btn = make_pool_badge(
                f"{type_def['label']} ({count})", partial(self._on_claim_pool_modifier, "modifier", type_id)
            )
            self.pool_layout.addWidget(btn)

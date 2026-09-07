// app/app.mjs
import { CARD_VALUES, SHOE_BASE, MODIFIERS_TOTAL, ACTIONS_TOTAL } from './deck.mjs';
import { createEmptySeen, logCardSeen } from './shoe.mjs';
import { createEmptyLine, addCardToLine, addLucky13Card, addUnlucky7Card } from './line.mjs';
import { recommend } from './engine.mjs';
import { loadSeen, saveSeen, resetSeen, loadLine, saveLine, clearLine } from './storage.mjs';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js');
  });
}

let seen = loadSeen();
let line = loadLine();
let previousState = null;

function snapshot() {
  previousState = { seen, line };
}

function cardLabel(value, kind) {
  if (value === 0) return '0 (Zéro)';
  if (value === 7 && kind === 'special') return '7 – Malchance';
  if (value === 13 && kind === 'special') return '13 – Chance';
  return String(value);
}

function logMyCard(value, kind) {
  snapshot();
  seen = logCardSeen(seen, value, kind);
  if (value === 7 && kind === 'special') {
    line = addUnlucky7Card(line);
  } else if (value === 13 && kind === 'special') {
    line = addLucky13Card(line);
  } else {
    line = addCardToLine(line, value);
  }
  saveSeen(seen);
  saveLine(line);
  render();
}

function logOtherPlayerCard(value, kind) {
  snapshot();
  seen = logCardSeen(seen, value, kind);
  saveSeen(seen);
  render();
}

function logOtherCard() {
  snapshot();
  seen = logCardSeen(seen, 'other', null);
  saveSeen(seen);
  render();
}

function buildSeenGrid() {
  const container = document.getElementById('seen-grid');
  for (const v of CARD_VALUES) {
    for (const kind of ['regular', 'special']) {
      if (SHOE_BASE[v][kind] === 0) continue;
      const btn = document.createElement('button');
      btn.textContent = cardLabel(v, kind);
      btn.addEventListener('click', () => logOtherPlayerCard(v, kind));
      container.appendChild(btn);
    }
  }
  const otherBtn = document.createElement('button');
  otherBtn.textContent = 'Autre (modif/action)';
  otherBtn.addEventListener('click', logOtherCard);
  container.appendChild(otherBtn);
}

function buildLineGrid() {
  const container = document.getElementById('line-grid');
  for (const v of CARD_VALUES) {
    for (const kind of ['regular', 'special']) {
      if (SHOE_BASE[v][kind] === 0) continue;
      const btn = document.createElement('button');
      btn.textContent = cardLabel(v, kind);
      btn.addEventListener('click', () => logMyCard(v, kind));
      container.appendChild(btn);
    }
  }
}

function buildManualEdit() {
  const container = document.getElementById('manual-edit');
  for (const v of CARD_VALUES) {
    for (const kind of ['regular', 'special']) {
      const max = SHOE_BASE[v][kind];
      if (max === 0) continue;
      const label = document.createElement('label');
      label.textContent = `${cardLabel(v, kind)} vues : `;
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.max = String(max);
      input.dataset.value = String(v);
      input.dataset.kind = kind;
      input.addEventListener('change', () => {
        const parsed = Number(input.value);
        if (!Number.isInteger(parsed) || parsed < 0 || parsed > max) {
          input.value = String(seen[v][kind]);
          return;
        }
        snapshot();
        seen = { ...seen, [v]: { ...seen[v], [kind]: parsed } };
        saveSeen(seen);
        render();
      });
      label.appendChild(input);
      container.appendChild(label);
    }
  }

  const otherLabel = document.createElement('label');
  otherLabel.textContent = 'Autres cartes (modif/action) vues : ';
  const otherInput = document.createElement('input');
  otherInput.type = 'number';
  otherInput.min = '0';
  otherInput.max = String(MODIFIERS_TOTAL + ACTIONS_TOTAL);
  otherInput.id = 'manual-other';
  otherInput.addEventListener('change', () => {
    const max = MODIFIERS_TOTAL + ACTIONS_TOTAL;
    const parsed = Number(otherInput.value);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > max) {
      otherInput.value = String(seen.other);
      return;
    }
    snapshot();
    seen = { ...seen, other: parsed };
    saveSeen(seen);
    render();
  });
  otherLabel.appendChild(otherInput);
  container.appendChild(otherLabel);
}

function render() {
  const result = recommend(seen, line);
  document.getElementById('prob-bust').textContent = (result.probabilities.bust * 100).toFixed(1);
  document.getElementById('prob-reset').textContent = (result.probabilities.reset * 100).toFixed(1);
  document.getElementById('prob-progress').textContent = (result.probabilities.progress * 100).toFixed(1);
  document.getElementById('prob-neutral').textContent = (result.probabilities.neutral * 100).toFixed(1);
  document.getElementById('raw-score').textContent = String(result.rawScore);
  document.getElementById('ev-value').textContent = result.ev.toFixed(1);
  document.getElementById('recommendation').textContent = result.action;

  for (const v of CARD_VALUES) {
    for (const kind of ['regular', 'special']) {
      if (SHOE_BASE[v][kind] === 0) continue;
      const input = document.querySelector(`#manual-edit input[data-value="${v}"][data-kind="${kind}"]`);
      if (input) input.value = String(seen[v][kind]);
    }
  }
  const otherInput = document.getElementById('manual-other');
  if (otherInput) otherInput.value = String(seen.other);
}

document.getElementById('undo-btn').addEventListener('click', () => {
  if (!previousState) return;
  seen = previousState.seen;
  line = previousState.line;
  previousState = null;
  saveSeen(seen);
  saveLine(line);
  render();
});

document.getElementById('new-round-btn').addEventListener('click', () => {
  snapshot();
  line = createEmptyLine();
  clearLine();
  render();
});

document.getElementById('reshuffle-btn').addEventListener('click', () => {
  snapshot();
  seen = createEmptySeen();
  resetSeen();
  render();
});

document.getElementById('new-game-btn').addEventListener('click', () => {
  snapshot();
  seen = createEmptySeen();
  line = createEmptyLine();
  resetSeen();
  clearLine();
  render();
});

buildSeenGrid();
buildLineGrid();
buildManualEdit();
render();

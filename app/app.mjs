// app/app.mjs
import { CARD_VALUES, SHOE_BASE, MODIFIER_TYPES, ACTION_TYPES } from './deck.mjs';
import { createEmptySeen, logCardSeen, logSpecialCardSeen, remainingCount } from './shoe.mjs';
import { createEmptyLine, addCardToLine, addLucky13Card, addUnlucky7Card, removeCardFromLine } from './line.mjs';
import { createEmptyRoundSeen, logRoundCard, poolAvailable } from './round.mjs';
import { recommend } from './engine.mjs';
import {
  loadSeen,
  saveSeen,
  resetSeen,
  loadLine,
  saveLine,
  clearLine,
  loadRoundSeen,
  saveRoundSeen,
  resetRoundSeen,
} from './storage.mjs';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js');
  });
}

let seen = loadSeen();
let line = loadLine();
let roundSeen = loadRoundSeen();
let previousState = null;

function snapshot() {
  previousState = { seen, line, roundSeen };
}

function cardLabel(value, kind) {
  if (value === 0) return '0 (Zéro)';
  if (value === 7 && kind === 'special') return '7 – Malchance';
  if (value === 13 && kind === 'special') return '13 – Chance';
  return String(value);
}

function logMyCard(value, kind) {
  let nextSeen, nextRoundSeen;
  try {
    nextSeen = logCardSeen(seen, value, kind);
    nextRoundSeen = logRoundCard(roundSeen, value, kind);
  } catch (err) {
    alert(err.message);
    return;
  }
  snapshot();
  seen = nextSeen;
  roundSeen = nextRoundSeen;
  if (value === 7 && kind === 'special') {
    line = addUnlucky7Card(line);
  } else if (value === 13 && kind === 'special') {
    line = addLucky13Card(line);
  } else {
    line = addCardToLine(line, value);
  }
  saveSeen(seen);
  saveRoundSeen(roundSeen);
  saveLine(line);
  render();
}

function removeMyCard(value) {
  snapshot();
  line = removeCardFromLine(line, value);
  saveLine(line);
  render();
}

function takeFromPool(value, kind) {
  snapshot();
  if (value === 7 && kind === 'special') {
    line = addUnlucky7Card(line);
  } else if (value === 13 && kind === 'special') {
    line = addLucky13Card(line);
  } else {
    line = addCardToLine(line, value);
  }
  saveLine(line);
  render();
}

function logOtherPlayerCard(value, kind) {
  let nextSeen, nextRoundSeen;
  try {
    nextSeen = logCardSeen(seen, value, kind);
    nextRoundSeen = logRoundCard(roundSeen, value, kind);
  } catch (err) {
    alert(err.message);
    return;
  }
  snapshot();
  seen = nextSeen;
  roundSeen = nextRoundSeen;
  saveSeen(seen);
  saveRoundSeen(roundSeen);
  render();
}

function logSpecialCard(category, id) {
  let nextSeen;
  try {
    nextSeen = logSpecialCardSeen(seen, category, id);
  } catch (err) {
    alert(err.message);
    return;
  }
  snapshot();
  seen = nextSeen;
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
      btn.dataset.value = String(v);
      btn.dataset.kind = kind;
      btn.addEventListener('click', () => logOtherPlayerCard(v, kind));
      container.appendChild(btn);
    }
  }
  for (const [id, type] of Object.entries(MODIFIER_TYPES)) {
    const btn = document.createElement('button');
    btn.textContent = type.label;
    btn.dataset.category = 'modifier';
    btn.dataset.typeId = id;
    btn.addEventListener('click', () => logSpecialCard('modifier', id));
    container.appendChild(btn);
  }
  for (const [id, type] of Object.entries(ACTION_TYPES)) {
    const btn = document.createElement('button');
    btn.textContent = type.label;
    btn.dataset.category = 'action';
    btn.dataset.typeId = id;
    btn.addEventListener('click', () => logSpecialCard('action', id));
    container.appendChild(btn);
  }
}

function buildLineGrid() {
  const container = document.getElementById('line-grid');
  for (const v of CARD_VALUES) {
    for (const kind of ['regular', 'special']) {
      if (SHOE_BASE[v][kind] === 0) continue;
      const btn = document.createElement('button');
      btn.textContent = cardLabel(v, kind);
      btn.dataset.value = String(v);
      btn.dataset.kind = kind;
      btn.addEventListener('click', () => logMyCard(v, kind));
      container.appendChild(btn);
    }
  }
}

function recomputeOther(seen) {
  const sum = (counts) => Object.values(counts).reduce((total, n) => total + n, 0);
  return sum(seen.modifierTypes) + sum(seen.actionTypes);
}

function appendSpecialCardInput(container, category, id, type) {
  const label = document.createElement('label');
  label.textContent = `${type.label} vues : `;
  const input = document.createElement('input');
  input.type = 'number';
  input.min = '0';
  input.max = String(type.max);
  input.dataset.category = category;
  input.dataset.typeId = id;
  input.addEventListener('change', () => {
    const currentCounts = category === 'modifier' ? seen.modifierTypes : seen.actionTypes;
    const parsed = Number(input.value);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > type.max) {
      input.value = String(currentCounts[id]);
      return;
    }
    snapshot();
    const key = category === 'modifier' ? 'modifierTypes' : 'actionTypes';
    const nextSeen = { ...seen, [key]: { ...currentCounts, [id]: parsed } };
    nextSeen.other = recomputeOther(nextSeen);
    seen = nextSeen;
    saveSeen(seen);
    render();
  });
  label.appendChild(input);
  container.appendChild(label);
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

  for (const [id, type] of Object.entries(MODIFIER_TYPES)) {
    appendSpecialCardInput(container, 'modifier', id, type);
  }
  for (const [id, type] of Object.entries(ACTION_TYPES)) {
    appendSpecialCardInput(container, 'action', id, type);
  }
}

function syncSpecialCardControls(category, id, type, count) {
  const input = document.querySelector(`#manual-edit input[data-category="${category}"][data-type-id="${id}"]`);
  if (input) input.value = String(count);
  const btn = document.querySelector(`#seen-grid button[data-category="${category}"][data-type-id="${id}"]`);
  if (btn) btn.disabled = count >= type.max;
}

function renderMyCards() {
  const container = document.getElementById('my-cards');
  container.innerHTML = '';
  const chips = [];
  for (const v of line.values) {
    if (v === 7) {
      chips.push({ value: 7, kind: line.sevenKind });
    } else if (v === 13) {
      if (line.hasRegular13) chips.push({ value: 13, kind: 'regular' });
      if (line.hasLucky13) chips.push({ value: 13, kind: 'special' });
    } else {
      chips.push({ value: v, kind: 'regular' });
    }
  }
  for (const { value, kind } of chips) {
    const chip = document.createElement('span');
    chip.className = 'held-card';
    chip.textContent = cardLabel(value, kind);
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => removeMyCard(value));
    chip.appendChild(removeBtn);
    container.appendChild(chip);
  }
}

function renderPoolGrid() {
  const container = document.getElementById('pool-grid-items');
  container.innerHTML = '';
  for (const v of CARD_VALUES) {
    for (const kind of ['regular', 'special']) {
      if (SHOE_BASE[v][kind] === 0) continue;
      const available = poolAvailable(roundSeen, line, v, kind);
      if (available <= 0) continue;
      const btn = document.createElement('button');
      btn.textContent = `${cardLabel(v, kind)} (${available})`;
      btn.addEventListener('click', () => takeFromPool(v, kind));
      container.appendChild(btn);
    }
  }
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

      const exhausted = remainingCount(seen, v, kind) === 0;
      const seenBtn = document.querySelector(`#seen-grid button[data-value="${v}"][data-kind="${kind}"]`);
      if (seenBtn) seenBtn.disabled = exhausted;
      const lineBtn = document.querySelector(`#line-grid button[data-value="${v}"][data-kind="${kind}"]`);
      if (lineBtn) lineBtn.disabled = exhausted;
    }
  }
  for (const [id, type] of Object.entries(MODIFIER_TYPES)) {
    syncSpecialCardControls('modifier', id, type, seen.modifierTypes[id]);
  }
  for (const [id, type] of Object.entries(ACTION_TYPES)) {
    syncSpecialCardControls('action', id, type, seen.actionTypes[id]);
  }

  renderMyCards();
  renderPoolGrid();
}

document.getElementById('undo-btn').addEventListener('click', () => {
  if (!previousState) return;
  seen = previousState.seen;
  line = previousState.line;
  roundSeen = previousState.roundSeen;
  previousState = null;
  saveSeen(seen);
  saveLine(line);
  saveRoundSeen(roundSeen);
  render();
});

document.getElementById('new-round-btn').addEventListener('click', () => {
  snapshot();
  line = createEmptyLine();
  roundSeen = createEmptyRoundSeen();
  clearLine();
  resetRoundSeen();
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
  roundSeen = createEmptyRoundSeen();
  resetSeen();
  clearLine();
  resetRoundSeen();
  render();
});

buildSeenGrid();
buildLineGrid();
buildManualEdit();
render();

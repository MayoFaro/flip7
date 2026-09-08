// app/app.mjs
import { CARD_VALUES, SHOE_BASE, MODIFIER_TYPES, ACTION_TYPES } from './deck.mjs';
import { createEmptySeen, logCardSeen, logSpecialCardSeen, remainingCount } from './shoe.mjs';
import { createEmptyLine, addCardToLine, addLucky13Card, addUnlucky7Card, removeCardFromLine } from './line.mjs';
import { createEmptyRoundSeen, logRoundCard, logRoundSpecialCard, poolAvailable } from './round.mjs';
import { recommend, isSafeCard } from './engine.mjs';
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

const RECENT_CARDS_LIMIT = 5;

let seen = loadSeen();
let line = loadLine();
let roundSeen = loadRoundSeen();
let recentCards = []; // last few revealed card labels, oldest first
let undoStack = []; // unlimited history of {seen, line, roundSeen, recentCards} snapshots
let pendingPoolSelection = null; // { value, kind } awaiting a "Ma ligne" card to swap with

function snapshot() {
  undoStack.push({ seen, line, roundSeen, recentCards });
}

// Only actual reveal events (a card newly logged from the shoe) belong
// here — taking a card from the swap pool, removing one, or claiming a
// Modifier from the pool don't introduce a new card, so they don't push.
function pushRecent(label) {
  recentCards = [...recentCards, label].slice(-RECENT_CARDS_LIMIT);
}

function addCardByKind(currentLine, value, kind) {
  if (value === 7 && kind === 'special') return addUnlucky7Card(currentLine);
  if (value === 13 && kind === 'special') return addLucky13Card(currentLine);
  return addCardToLine(currentLine, value);
}

// Reconstructs a Seen tally that marks only the player's own currently
// held cards as unavailable, everything else fresh. Used by "Reshuffle":
// per the rulebook, a mid-round reshuffle only remixes the discard pile —
// any card still in front of a player stays out of circulation. This tool
// can only ever know about the player's own line (opponents' hands aren't
// tracked), so it's a partial correction: it stops your own held cards
// from wrongly reappearing as "available," but can't account for cards
// still held by other players at the table.
function seenFromMyLine(currentLine) {
  let result = createEmptySeen();
  for (const v of currentLine.values) {
    if (v === 0) {
      result = logCardSeen(result, 0, 'special');
    } else if (v === 7) {
      result = logCardSeen(result, 7, currentLine.sevenKind);
    } else if (v === 13) {
      if (currentLine.hasRegular13) result = logCardSeen(result, 13, 'regular');
      if (currentLine.hasLucky13) result = logCardSeen(result, 13, 'special');
    } else {
      result = logCardSeen(result, v, 'regular');
    }
  }
  return result;
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
  line = addCardByKind(line, value, kind);
  pushRecent(cardLabel(value, kind));
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

// Tapping a held card completes a pending swap if one is selected in the
// pool; otherwise it removes the card outright, representing a Steal
// against the player (nothing comes back in return). Both are single-step,
// and both go through the same unlimited undo stack.
function myCardClick(value) {
  if (pendingPoolSelection) {
    completeSwap(value);
  } else {
    removeMyCard(value);
  }
}

// Completes a pending pool selection by swapping it with one of the player's
// currently held cards: `removeValue` leaves the line, the pending pool card
// takes its place. Safety is checked against the line *after* the removal,
// since giving up a card can make an otherwise-busting take safe again.
function completeSwap(removeValue) {
  if (!pendingPoolSelection) return;
  const { value, kind } = pendingPoolSelection;
  const isUnluckySeven = value === 7 && kind === 'special';
  const lineAfterRemoval = removeCardFromLine(line, removeValue);
  if (!isUnluckySeven && !isSafeCard(lineAfterRemoval, value, kind)) {
    alert('Cette carte est déjà dans votre ligne — la prendre vous ferait buster.');
    pendingPoolSelection = null;
    render();
    return;
  }
  snapshot();
  line = addCardByKind(lineAfterRemoval, value, kind);
  pendingPoolSelection = null;
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
  pushRecent(cardLabel(value, kind));
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
  roundSeen = logRoundSpecialCard(roundSeen, category, id);
  const type = category === 'modifier' ? MODIFIER_TYPES[id] : ACTION_TYPES[id];
  pushRecent(type.label);
  saveSeen(seen);
  saveRoundSeen(roundSeen);
  render();
}

// Flip 7's own rulebook calls 0, Unlucky 7, and Lucky 13 the three
// "Special Number Cards" — grouped with Modifier/Action cards in the
// "specials" column, not with the plain 1-13 number progression.
function isSpecialNumberCard(value, kind) {
  return (value === 0 || value === 7 || value === 13) && kind === 'special';
}

// Modifier/Action buttons log to the same shared shoe tally regardless of
// which zone they're tapped in — Line never tracks who holds a modifier,
// only how many remain in the shoe — so both "Autres joueurs" and "Ma
// ligne" get the identical set of buttons wired to the identical handler.
function appendSpecialCardButtons(container) {
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

function buildSeenGrid() {
  const numbers = document.getElementById('seen-grid-numbers');
  const specials = document.getElementById('seen-grid-specials');
  for (const v of CARD_VALUES) {
    for (const kind of ['regular', 'special']) {
      if (SHOE_BASE[v][kind] === 0) continue;
      const btn = document.createElement('button');
      btn.textContent = cardLabel(v, kind);
      btn.dataset.value = String(v);
      btn.dataset.kind = kind;
      btn.addEventListener('click', () => logOtherPlayerCard(v, kind));
      (isSpecialNumberCard(v, kind) ? specials : numbers).appendChild(btn);
    }
  }
  appendSpecialCardButtons(specials);
}

function buildLineGrid() {
  const numbers = document.getElementById('line-grid-numbers');
  const specials = document.getElementById('line-grid-specials');
  for (const v of CARD_VALUES) {
    for (const kind of ['regular', 'special']) {
      if (SHOE_BASE[v][kind] === 0) continue;
      const btn = document.createElement('button');
      btn.textContent = cardLabel(v, kind);
      btn.dataset.value = String(v);
      btn.dataset.kind = kind;
      btn.addEventListener('click', () => logMyCard(v, kind));
      (isSpecialNumberCard(v, kind) ? specials : numbers).appendChild(btn);
    }
  }
  appendSpecialCardButtons(specials);
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
  const disabled = count >= type.max;
  // The same Modifier/Action buttons appear in both zones (shared tally) —
  // both copies must stay in sync.
  const seenBtn = document.querySelector(`#seen-grid-specials button[data-category="${category}"][data-type-id="${id}"]`);
  if (seenBtn) seenBtn.disabled = disabled;
  const lineBtn = document.querySelector(`#line-grid-specials button[data-category="${category}"][data-type-id="${id}"]`);
  if (lineBtn) lineBtn.disabled = disabled;
}

function renderMyCards() {
  const container = document.getElementById('my-cards');
  container.innerHTML = '';
  const chips = [];
  for (const v of line.values) {
    if (v === 7) {
      chips.push({ value: 7, label: cardLabel(7, line.sevenKind) });
    } else if (v === 13) {
      if (line.hasRegular13 && line.hasLucky13) {
        chips.push({ value: 13, label: '13 (+ Chance)' });
      } else if (line.hasLucky13) {
        chips.push({ value: 13, label: cardLabel(13, 'special') });
      } else {
        chips.push({ value: 13, label: cardLabel(13, 'regular') });
      }
    } else {
      chips.push({ value: v, label: cardLabel(v, 'regular') });
    }
  }
  for (const { value, label } of chips) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'held-card';
    chip.textContent = label;
    chip.addEventListener('click', () => myCardClick(value));
    container.appendChild(chip);
  }
}

// A Modifier/Action card claimed from the pool has no Line-side effect —
// Line never tracks who holds one, and a hand like {1,3,6,-8} has the
// identical bust/EV math as {1,3,6} once the -8 is already logged as
// seen. So "claiming" one is just removing it from the pool display
// (someone has it now), the same single-tap "Steal" pattern as removing
// a held Number card, and just as undoable via the same stack.
function claimPoolModifier(category, id) {
  snapshot();
  const key = category === 'modifier' ? 'modifierTypes' : 'actionTypes';
  roundSeen = { ...roundSeen, [key]: { ...roundSeen[key], [id]: roundSeen[key][id] - 1 } };
  saveRoundSeen(roundSeen);
  render();
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
      if (pendingPoolSelection && pendingPoolSelection.value === v && pendingPoolSelection.kind === kind) {
        btn.classList.add('pool-selected');
      }
      btn.addEventListener('click', () => {
        pendingPoolSelection = { value: v, kind };
        render();
      });
      container.appendChild(btn);
    }
  }
  // Modifier/Action cards: tap to claim one (Steal-style, single tap, no
  // Line effect — see claimPoolModifier).
  for (const [id, type] of Object.entries(MODIFIER_TYPES)) {
    const count = roundSeen.modifierTypes[id];
    if (count <= 0) continue;
    const badge = document.createElement('button');
    badge.type = 'button';
    badge.className = 'pool-info-badge';
    badge.textContent = `${type.label} (${count})`;
    badge.addEventListener('click', () => claimPoolModifier('modifier', id));
    container.appendChild(badge);
  }
  for (const [id, type] of Object.entries(ACTION_TYPES)) {
    const count = roundSeen.actionTypes[id];
    if (count <= 0) continue;
    const badge = document.createElement('button');
    badge.type = 'button';
    badge.className = 'pool-info-badge';
    badge.textContent = `${type.label} (${count})`;
    badge.addEventListener('click', () => claimPoolModifier('action', id));
    container.appendChild(badge);
  }
}

function render() {
  const result = recommend(seen, line);
  document.getElementById('prob-bust').textContent = (result.probabilities.bust * 100).toFixed(1);
  document.getElementById('recommendation').textContent = result.action;
  document.getElementById('deck-count').textContent = String(result.buckets.D);
  document.getElementById('recent-cards').textContent = recentCards.length
    ? recentCards.slice().reverse().join(', ')
    : '–';

  for (const v of CARD_VALUES) {
    for (const kind of ['regular', 'special']) {
      if (SHOE_BASE[v][kind] === 0) continue;
      const input = document.querySelector(`#manual-edit input[data-value="${v}"][data-kind="${kind}"]`);
      if (input) input.value = String(seen[v][kind]);

      const exhausted = remainingCount(seen, v, kind) === 0;
      const seenBtn = document.querySelector(
        `#seen-grid-numbers button[data-value="${v}"][data-kind="${kind}"], #seen-grid-specials button[data-value="${v}"][data-kind="${kind}"]`
      );
      if (seenBtn) seenBtn.disabled = exhausted;
      const lineBtn = document.querySelector(
        `#line-grid-numbers button[data-value="${v}"][data-kind="${kind}"], #line-grid-specials button[data-value="${v}"][data-kind="${kind}"]`
      );
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
  if (undoStack.length === 0) return;
  const previous = undoStack.pop();
  seen = previous.seen;
  line = previous.line;
  roundSeen = previous.roundSeen;
  recentCards = previous.recentCards;
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
  seen = seenFromMyLine(line);
  saveSeen(seen);
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

// Capture phase runs before any specific button's own click handler, so this
// sees the DOM/state as it was at click time — before a handler like
// renderPoolGrid()/render() might destructively rebuild the very element
// that was clicked. Clicks inside the pool or the player's line are left to
// their own handlers (selecting a new pool card, or completing a swap);
// every other click cancels a pending pool selection with no side effect.
document.addEventListener(
  'click',
  (event) => {
    if (!pendingPoolSelection) return;
    if (event.target.closest('#pool-grid, #my-cards')) return;
    pendingPoolSelection = null;
    render();
  },
  true
);

buildSeenGrid();
buildLineGrid();
buildManualEdit();
render();

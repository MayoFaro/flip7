# Flip 7 Desktop

Native PySide6 port of the Flip 7 hit/stay advisor, pinned always-on-top.

## Setup

```bash
cd desktop
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
```

## Run

```bash
.venv/bin/flip7-desktop
```

## Test

```bash
.venv/bin/pytest
```

State is persisted to `~/.flip7-desktop/state.json`.

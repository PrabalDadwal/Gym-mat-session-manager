#!/usr/bin/env bash
set -e

# Setup virtual environment and run Apex Mat Lab
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

echo "Activating virtual environment..."
source venv/bin/activate

echo "Installing requirements..."
pip install -r requirements.txt

echo "Starting Uvicorn dev server on port 3000..."
exec uvicorn app.main:app --host 0.0.0.0 --port 3000 --reload

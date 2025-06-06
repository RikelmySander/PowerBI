@echo off
cd "C:\Users\Rikel\Documents\Power BI\Crypto\PowerBI"

echo Iniciando Uvicorn...
start "" uvicorn main:app --reload --port 8000

timeout /t 5

echo Coletando historico do portfolio...
python collect_portfolio_history.py

echo Processo concluido.
pause

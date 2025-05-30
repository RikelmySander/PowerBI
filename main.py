from fastapi import FastAPI
from binance.client import Client
import pandas as pd
from dotenv import load_dotenv
import os

# for run these code enter: uvicorn main:app --reload --port 8000
#margem de erro da API $20

# Carrega as variáveis do .env
load_dotenv()

api_key = os.getenv('BINANCE_API_KEY')
api_secret = os.getenv('BINANCE_API_SECRET')

client = Client(api_key, api_secret)

app = FastAPI()

# Normaliza nomes de ativos removendo prefixos conhecidos
def normalize_asset(asset):
    if asset.startswith("LD"):
        return asset[2:]
    return asset

def normalize_for_lookup(asset):
    """Normaliza somente para lookup (preço e trades)."""
    if asset == "SHIB2":
        return "SHIB"
    return asset

def get_current_price(symbol):
    try:
        ticker = client.get_symbol_ticker(symbol=symbol)
        return float(ticker['price'])
    except:
        return None

def get_price_in_usdt(asset):
    normalized_asset = normalize_for_lookup(asset)
    symbol_usdt = f"{normalized_asset}USDT"
    price = get_current_price(symbol_usdt)
    if price is not None:
        return price
    return None  # Para simplificação: só tenta USDT direto

def get_balances():
    # Spot
    account = client.get_account()
    spot_balances = pd.DataFrame(account['balances'])
    spot_balances['source'] = 'Spot'

    # Earn
    try:
        earn_data = client.get_product_position()
    except AttributeError:
        earn_data = []  # Se não tiver função ou der erro
    earn_balances = pd.DataFrame(earn_data) if earn_data else pd.DataFrame(columns=['asset', 'amount'])
    if not earn_balances.empty:
        earn_balances['free'] = earn_balances['amount']
        earn_balances['source'] = 'Earn'
    else:
        earn_balances = pd.DataFrame(columns=['asset', 'free', 'source'])

    # Concatena os balances
    balances = pd.concat([spot_balances[['asset', 'free', 'source']],
                          earn_balances[['asset', 'free', 'source']]], ignore_index=True)

    # Converte 'free' para numérico
    balances['free'] = pd.to_numeric(balances['free'], errors='coerce')

    # Remove saldos zerados
    balances = balances[balances['free'] > 0]

    # Normaliza os ativos
    balances['normalized_asset'] = balances['asset'].apply(normalize_asset)

    # Agrupa somando os saldos
    grouped = balances.groupby('normalized_asset').agg({'free': 'sum'}).reset_index()

    result = []

    for _, row in grouped.iterrows():
        asset = row['normalized_asset']
        total_balance = row['free']

        # Preço atual
        if asset in ['BRL', 'USDT']:
            current_price = 1  # Para BRL e USDT → preço unitário
            current_value = total_balance
        else:
            current_price = get_price_in_usdt(asset)
            current_value = total_balance * current_price if current_price else None

        # Busca trades
        lookup_asset = normalize_for_lookup(asset)
        symbol = f"{lookup_asset}USDT"
        try:
            trades = client.get_my_trades(symbol=symbol)
            if trades:
                total_qty = sum(float(t['qty']) for t in trades)
                total_spent = sum(float(t['qty']) * float(t['price']) for t in trades)
                avg_price = total_spent / total_qty if total_qty > 0 else None
                total_cost = total_balance * avg_price if avg_price else None
            else:
                avg_price = None
                total_cost = None
        except:
            avg_price = None
            total_cost = None

        # Verifica se foi adquirido "de graça"
        acquired_free = False

        # Lucro/Prejuízo
        if asset in ['BRL', 'USDT']:
            profit_loss = total_balance
            profit_loss_pct = 100.0
            acquired_free = True
        elif current_value is not None:
            if not total_cost or total_cost == 0:
                profit_loss = current_value
                profit_loss_pct = 100.0
                acquired_free = True
            else:
                profit_loss = current_value - total_cost
                profit_loss_pct = (profit_loss / total_cost) * 100
        else:
            profit_loss = None
            profit_loss_pct = None

        result.append({
            "asset": asset,
            "total_balance": total_balance,
            "current_price_usdt": current_price,
            "current_value_usdt": current_value,
            "average_buy_price_usdt": avg_price,
            "total_cost_usdt": total_cost,
            "profit_loss_usdt": profit_loss,
            "profit_loss_percent": profit_loss_pct,
            "acquired_free": acquired_free
        })
    return result

@app.get("/balances")
def balances_endpoint():
    try:
        result = get_balances()
        return result  # ← Agora só retorna a lista direta
    except Exception as e:
        return {"error": str(e), "message": "Erro ao calcular os balances."}

from datetime import datetime

@app.get("/transactions")
def transactions_endpoint():
    try:
        balances = get_balances()
        all_trades = []

        for item in balances:
            asset = item['asset']
            if asset in ['BRL']:
                continue  # pula BRL pois não tem get_my_trades

            lookup_asset = normalize_for_lookup(asset)
            symbol = f"{lookup_asset}USDT"
            try:
                trades = client.get_my_trades(symbol=symbol)
                for t in trades:
                    timestamp_ms = t['time']
                    timestamp_sec = timestamp_ms / 1000
                    human_time = datetime.utcfromtimestamp(timestamp_sec).strftime('%Y-%m-%d %H:%M:%S')

                    all_trades.append({
                        "asset": asset,
                        "symbol": symbol,
                        "orderId": t['orderId'],
                        "price": float(t['price']),
                        "qty": float(t['qty']),
                        "quoteQty": float(t['quoteQty']),
                        "commission": float(t['commission']),
                        "commissionAsset": t['commissionAsset'],
                        "time": t['time'],
                        "timestamp_human": human_time,
                        "isBuyer": t['isBuyer']
                    })
            except Exception as e:
                continue

        return all_trades

    except Exception as e:
        return {"error": str(e), "message": "Erro ao buscar transações."}

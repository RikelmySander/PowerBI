from fastapi import FastAPI
from binance.client import Client
import pandas as pd
from dotenv import load_dotenv
import os

# for run these code enter: uvicorn main:app --reload --port 8001

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
        if current_value is not None:
            if not total_cost or total_cost == 0:
                # Sem custo → lucro = valor atual
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
        total_portfolio_value = 0
        for item in result:
            if item['asset'] in ['BRL', 'USDT']:
                total_portfolio_value += item['total_balance']
            elif item['current_value_usdt'] is not None:
                total_portfolio_value += item['current_value_usdt']

        return {
            "total_portfolio_value_usdt": total_portfolio_value,
            "assets": result
        }
    except Exception as e:
        return {"error": str(e), "message": "Erro ao calcular os balances."}
import os
import time
import hmac
import hashlib
import requests
import pandas as pd
from datetime import datetime
from dotenv import load_dotenv
from fastapi import FastAPI
from binance.client import Client

# ===================== CONFIG =====================
BINANCE_API_URL = "https://api.binance.com"

# Carrega chaves do .env
load_dotenv()
api_key = os.getenv("BINANCE_API_KEY")
api_secret = os.getenv("BINANCE_API_SECRET")

# Binance Python Client
client = Client(api_key, api_secret)
client._timestamp_offset = 0
client._sync_request_time = True
client.recv_window = 10000

# FastAPI App
app = FastAPI(title="Binance API Wrapper")

# ===================== FUNÇÕES AUXILIARES =====================

def normalize_asset(asset):
    """Normaliza nomes de ativos removendo prefixos conhecidos"""
    if asset.startswith("LD"):
        return asset[2:]
    return asset

def normalize_for_lookup(asset):
    """Normaliza para lookup de preços/trades"""
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
    return get_current_price(symbol_usdt)

def signed_request(http_method, url_path, payload=None):
    """Chama endpoints assinados da Binance (REST direto)"""
    if payload is None:
        payload = {}

    payload["timestamp"] = int(time.time() * 1000)
    query_string = "&".join([f"{k}={v}" for k, v in payload.items()])

    signature = hmac.new(
        api_secret.encode("utf-8"),
        query_string.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()

    payload["signature"] = signature
    headers = {"X-MBX-APIKEY": api_key}

    if http_method == "GET":
        return requests.get(BINANCE_API_URL + url_path, headers=headers, params=payload).json()
    else:
        return requests.post(BINANCE_API_URL + url_path, headers=headers, params=payload).json()

# ===================== ENDPOINTS =====================

@app.get("/")
def root():
    return {"message": "API Binance FastAPI está rodando 🚀", "endpoints": ["/balances", "/transactions", "/fiat_history"]}


@app.get("/balances")
def balances_endpoint():
    """Retorna os saldos (Spot + Earn) consolidados com PnL"""
    try:
        # Spot
        account = client.get_account()
        spot_balances = pd.DataFrame(account['balances'])
        spot_balances['source'] = 'Spot'

        # Earn
        try:
            earn_data = client.get_product_position()
        except AttributeError:
            earn_data = []
        earn_balances = pd.DataFrame(earn_data) if earn_data else pd.DataFrame(columns=['asset', 'amount'])
        if not earn_balances.empty:
            earn_balances['free'] = earn_balances['amount']
            earn_balances['source'] = 'Earn'
        else:
            earn_balances = pd.DataFrame(columns=['asset', 'free', 'source'])

        # Concatena
        balances = pd.concat([spot_balances[['asset', 'free', 'source']],
                              earn_balances[['asset', 'free', 'source']]], ignore_index=True)

        balances['free'] = pd.to_numeric(balances['free'], errors='coerce')
        balances = balances[balances['free'] > 0]
        balances['normalized_asset'] = balances['asset'].apply(normalize_asset)

        grouped = balances.groupby('normalized_asset').agg({'free': 'sum'}).reset_index()

        result = []
        for _, row in grouped.iterrows():
            asset = row['normalized_asset']
            total_balance = row['free']

            # Preço atual
            if asset in ['BRL', 'USDT']:
                current_price = 1
                current_value = total_balance
            else:
                current_price = get_price_in_usdt(asset)
                current_value = total_balance * current_price if current_price else None

            # Trades
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

            acquired_free = False
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
    except Exception as e:
        return {"error": str(e), "message": "Erro ao calcular os balances."}


@app.get("/transactions")
def transactions_endpoint():
    """Retorna histórico de trades do usuário"""
    try:
        balances = balances_endpoint()
        all_trades = []

        for item in balances:
            asset = item['asset']
            if asset == 'BRL':
                continue
            lookup_asset = normalize_for_lookup(asset)
            symbol = f"{lookup_asset}USDT"
            try:
                trades = client.get_my_trades(symbol=symbol)
                for t in trades:
                    timestamp_ms = t['time']
                    human_time = datetime.utcfromtimestamp(timestamp_ms / 1000).strftime('%Y-%m-%d %H:%M:%S')
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
            except:
                continue
        return all_trades
    except Exception as e:
        return {"error": str(e), "message": "Erro ao buscar transações."}

@app.get("/fiat_history")
def fiat_history_endpoint():
    """Retorna depósitos Fiat (BRL) e ordens BRL→USDT"""
    try:
        all_records = []
        rows = 100
        page = 1
        begin_time = int(time.mktime(time.strptime("2020-01-01 00:00:00", "%Y-%m-%d %H:%M:%S"))) * 1000
        end_time = int(time.time() * 1000)

        # ORDERS (BRL→USDT)
        while True:
            orders = signed_request("GET", "/sapi/v1/fiat/orders", {
                "transactionType": 0,
                "orderType": 1,
                "rows": rows,
                "page": page,
                "beginTime": begin_time,
                "endTime": end_time
            })
            data = orders.get("data", [])
            if not data: break
            for d in data:
                human_time = datetime.utcfromtimestamp(int(d["createTime"]) / 1000).strftime("%Y-%m-%d %H:%M:%S")
                all_records.append({
                    "type": "Order",
                    "orderId": d.get("orderId"),
                    "fiatCurrency": d.get("fiatCurrency"),
                    "indicatedAmount": d.get("indicatedAmount"),
                    "amount": d.get("amount"),
                    "totalFee": d.get("totalFee"),
                    "status": d.get("status"),
                    "method": d.get("paymentMethod"),
                    "createTime": d.get("createTime"),
                    "timestamp_human": human_time
                })
            if len(data) < rows: break
            page += 1

        # DEPOSITS (BRL)
        page = 1
        while True:
            deposits = signed_request("GET", "/sapi/v1/fiat/payments", {
                "transactionType": 0,
                "rows": rows,
                "page": page,
                "beginTime": begin_time,
                "endTime": end_time
            })
            data = deposits.get("data", [])
            if not data: break
            for d in data:
                human_time = datetime.utcfromtimestamp(int(d["createTime"]) / 1000).strftime("%Y-%m-%d %H:%M:%S")
                all_records.append({
                    "type": "Deposit",
                    "orderId": d.get("orderId"),
                    "fiatCurrency": d.get("fiatCurrency"),
                    "amount": d.get("amount"),
                    "totalFee": d.get("totalFee"),
                    "status": d.get("status"),
                    "method": d.get("paymentMethod"),
                    "createTime": d.get("createTime"),
                    "timestamp_human": human_time
                })
            if len(data) < rows: break
            page += 1

        all_records.sort(key=lambda x: x["createTime"])
        return all_records
    except Exception as e:
        return {"error": str(e), "message": "Erro ao buscar histórico fiat."}

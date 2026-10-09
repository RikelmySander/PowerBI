"""Compatibilidade com a automação antiga; o servidor registra o histórico."""

import requests

if __name__ == "__main__":
    response = requests.post("http://127.0.0.1:8000/api/refresh", timeout=180)
    response.raise_for_status()
    payload = response.json()
    print(f"Portfólio atualizado: US$ {payload['portfolio_value_usdt']:,.2f} ({payload['updated_at']})")

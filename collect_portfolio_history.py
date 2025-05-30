import requests
import csv
from datetime import datetime
import os

# Configurações
API_URL = "http://localhost:8000/balances"  # Ajuste a porta se necessário
CSV_FILE = "portfolio_history.csv"

def collect_and_save():
    try:
        # 1. Faz a requisição ao endpoint
        response = requests.get(API_URL)
        data = response.json()

        # 2. Soma todos os current_value_usdt
        total_value = sum(item['current_value_usdt'] for item in data if item['current_value_usdt'] is not None)

        # 3. Data e hora atual
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        # 4. Checa se o CSV existe
        file_exists = os.path.isfile(CSV_FILE)

        # 5. Escreve no CSV
        with open(CSV_FILE, mode='a', newline='') as file:
            writer = csv.writer(file)

            # Escreve cabeçalho se não existir
            if not file_exists:
                writer.writerow(['datetime', 'total_portfolio_value_usdt'])

            # Escreve os dados
            writer.writerow([now, total_value])

        print(f"[{now}] Total Portfolio Value: ${total_value:.2f} registrado com sucesso!")

    except Exception as e:
        print(f"Erro ao coletar ou salvar: {e}")

if __name__ == "__main__":
    collect_and_save()

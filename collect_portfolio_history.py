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

        # 3. Data atual (apenas data, sem hora)
        today = datetime.now().strftime("%Y-%m-%d")

        # 4. Carrega dados existentes, se houver
        rows = []
        if os.path.isfile(CSV_FILE):
            with open(CSV_FILE, mode='r', newline='') as file:
                reader = csv.reader(file)
                rows = list(reader)

        # 5. Atualiza ou adiciona registro
        updated = False
        for i, row in enumerate(rows):
            if row[0].startswith(today):  # se já existe registro para hoje
                rows[i] = [f"{today} {datetime.now().strftime('%H:%M:%S')}", total_value]
                updated = True
                break

        if not updated:
            # Adiciona cabeçalho se arquivo está vazio
            if not rows:
                rows.append(['datetime', 'total_portfolio_value_usdt'])
            # Adiciona novo registro
            rows.append([f"{today} {datetime.now().strftime('%H:%M:%S')}", total_value])

        # 6. Escreve o CSV atualizado
        with open(CSV_FILE, mode='w', newline='') as file:
            writer = csv.writer(file)
            writer.writerows(rows)

        print(f"[{today}] Total Portfolio Value: ${total_value:.2f} registrado/atualizado com sucesso!")

    except Exception as e:
        print(f"Erro ao coletar ou salvar: {e}")

if __name__ == "__main__":
    collect_and_save()

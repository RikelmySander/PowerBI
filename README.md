# Crypto Investments Dashboard

Dashboard local que substitui o Power BI e consulta a conta Binance ao iniciar.

## Como abrir

Use o atalho **Crypto Investments** na Área de Trabalho. Ele:

1. inicia a API e o servidor web local;
2. consulta saldos, operações e histórico fiat da Binance;
3. atualiza `portfolio_history.csv` e solicita a atualização de `PlanilhaCalculaCripto.xlsx`;
4. abre `http://127.0.0.1:8000` no navegador padrão.

Também é possível executar `start_crypto_dashboard.vbs`.

## Credenciais

As variáveis `BINANCE_API_KEY` e `BINANCE_API_SECRET` são lidas do arquivo `.env`
na pasta `Crypto`, preservando a configuração existente. Use uma chave somente leitura,
sem permissão de saque.

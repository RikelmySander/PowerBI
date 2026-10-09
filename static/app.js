const state={data:null,filter:"",columnFilters:{asset:"",quantity:"",price:"",change24h:"",value:"",average:"",result:"",roi:""}};
const colors=["#f0b90b","#ffd54a","#2dd4a3","#60a5fa","#a78bfa","#fb7185","#34d399","#f97316","#94a3b8"];
const $=id=>document.getElementById(id);
const usd=(value,digits=2)=>value==null?"—":new Intl.NumberFormat("pt-BR",{style:"currency",currency:"USD",minimumFractionDigits:digits,maximumFractionDigits:digits}).format(value);
const brl=value=>value==null?"—":new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(value);
const number=(value,digits=6)=>value==null?"—":new Intl.NumberFormat("pt-BR",{maximumFractionDigits:digits}).format(value);
const percent=value=>value==null?"—":`${value>=0?"+":""}${new Intl.NumberFormat("pt-BR",{maximumFractionDigits:2}).format(value)}%`;
const shortUsd=value=>value==null?"—":new Intl.NumberFormat("pt-BR",{style:"currency",currency:"USD",notation:value>=10000?"compact":"standard",maximumFractionDigits:value>=10000?1:0}).format(value);
const escapeHtml=value=>String(value??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const signClass=value=>value==null?"":value>=0?"positive":"negative";

async function loadData(force=false){
  setLoading(true);$("notice").hidden=true;
  try{
    const response=await fetch(force?"/api/refresh":"/api/dashboard",{method:force?"POST":"GET"});
    const payload=await response.json();
    if(!response.ok)throw new Error(payload.detail||"Não foi possível consultar a Binance.");
    state.data=payload;render();
    if(payload.warning)showNotice(`Dados anteriores exibidos. ${payload.warning}`);
  }catch(error){showNotice(error.message||"Erro ao atualizar os dados.");renderEmpty();}
  finally{setLoading(false)}
}

function setLoading(loading){
  $("refreshButton").disabled=loading;$("refreshButton").classList.toggle("loading",loading);$("syncDot").classList.toggle("loading",loading);
  if(loading)$("lastUpdated").textContent="Sincronizando com a Binance…";
}
function showNotice(message){const el=$("notice");el.textContent=message;el.hidden=false}

function render(){
  const d=state.data;
  ["portfolioUsd","investedUsd","pnlUsd","assetCount"].forEach(id=>$(id).classList.remove("skeleton"));
  $("lastUpdated").textContent=new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short"}).format(new Date(d.updated_at));
  renderSummary();renderInsights();renderAllocation();renderHistory();renderAssets();renderRankings();renderTransactions();renderFiat();renderOpenOrders();renderCryptoMovements();
}

function filteredBalances(){return state.filter?state.data.balances.filter(x=>x.asset.toLowerCase().includes(state.filter)):state.data.balances}

function renderSummary(){
  const d=state.data;const balances=filteredBalances();
  const portfolioValue=balances.reduce((sum,x)=>sum+(x.current_value_usdt||0),0);
  const investedCost=balances.reduce((sum,x)=>sum+(x.total_cost_usdt||0),0);
  const pnl=balances.reduce((sum,x)=>sum+(x.profit_loss_usdt||0),0);
  const roi=investedCost?pnl/investedCost*100:0;
  const partial=balances.some(x=>x.cost_basis_unavailable);
  $("portfolioUsd").textContent=usd(portfolioValue);
  $("portfolioBrl").textContent=d.usdt_brl?`${brl(portfolioValue*d.usdt_brl)} em reais`:"Conversão em BRL indisponível";
  $("investedUsd").textContent=usd(investedCost);
  $("investedDetail").textContent=partial?"Não inclui o custo de entrada do Copy Spot":"Baseada no preço médio das compras";
  $("pnlUsd").textContent=usd(pnl);$("pnlUsd").className=`metric-value ${signClass(pnl)}`;
  $("roiPercent").textContent=`${percent(roi)} de retorno${partial?" parcial":""}`;$("roiPercent").className=`metric-detail pill ${signClass(roi)}`;
  $("assetCount").textContent=balances.length;$("exchangeRate").textContent=d.usdt_brl?`1 USDT = ${brl(d.usdt_brl)}`:"Cotação USDT/BRL indisponível";
  $("donutTotal").textContent=shortUsd(portfolioValue);
}

function renderInsights(){
  const balances=filteredBalances().filter(x=>x.current_value_usdt>0);
  const total=balances.reduce((sum,x)=>sum+x.current_value_usdt,0);
  const change=balances.reduce((sum,x)=>sum+(x.value_change_24h_usdt||0),0);
  const previous=total-change;const changePercent=previous?change/previous*100:0;
  const shares=balances.map(x=>({...x,share:total?x.current_value_usdt/total*100:0}));
  const stablecoins=new Set(["USDT","USDC","FDUSD","DAI","TUSD"]);
  const stableShare=total?balances.filter(x=>stablecoins.has(x.asset)).reduce((sum,x)=>sum+x.current_value_usdt,0)/total*100:0;
  const top3=shares.slice(0,3).reduce((sum,x)=>sum+x.share,0);const largest=shares[0];
  $("change24h").textContent=percent(changePercent);$("change24h").className=signClass(change);
  $("change24hValue").textContent=`${usd(change)} estimados`;
  $("largestPosition").textContent=largest?`${largest.asset} · ${number(largest.share,1)}%`:"—";
  $("top3Concentration").textContent=number(top3,1)+"%";
  $("diversificationLabel").textContent=top3>=80?"Carteira concentrada":top3>=60?"Concentração moderada":"Carteira distribuída";
  $("stablecoinShare").textContent=number(stableShare,1)+"%";
  const copyRows=(state.data.copy_spot_balances||[]).filter(x=>!state.filter||x.asset.toLowerCase().includes(state.filter));
  const copyValue=copyRows.reduce((sum,x)=>sum+(x.current_value_usdt||0),0);
  $("copySpotValue").textContent=usd(copyValue);
  $("copySpotAssets").textContent=copyRows.length?`${copyRows.length} ${copyRows.length===1?"ativo":"ativos"} em Copy Trading`:"Nenhum ativo encontrado";
}

function renderAllocation(){
  const balances=filteredBalances().filter(x=>x.current_value_usdt>0);const total=balances.reduce((s,x)=>s+x.current_value_usdt,0);
  let main=balances.slice(0,8);const rest=balances.slice(8).reduce((s,x)=>s+x.current_value_usdt,0);if(rest>0)main.push({asset:"Outros",current_value_usdt:rest});
  let cursor=0;const stops=main.map((x,i)=>{const start=cursor;cursor+=x.current_value_usdt/total*100;return `${colors[i%colors.length]} ${start}% ${cursor}%`});
  $("donutChart").style.background=stops.length?`conic-gradient(${stops.join(",")})`:"#22252d";
  $("allocationLegend").innerHTML=main.map((x,i)=>`<div class="legend-row"><span class="legend-dot" style="background:${colors[i%colors.length]}"></span><span class="legend-name">${escapeHtml(x.asset)}</span><span class="legend-value">${(x.current_value_usdt/total*100).toFixed(1)}%</span></div>`).join("")||'<div class="empty-state">Sem valores disponíveis</div>';
}

function renderHistory(){
  if(state.filter){$("historyChart").innerHTML='<div class="empty-state">O histórico mensal está disponível apenas para a carteira completa.</div>';$("historyDelta").textContent="Carteira total";$("historyDelta").className="delta";return}
  const daily=state.data.history;if(daily.length<2){$("historyChart").innerHTML='<div class="empty-state">O gráfico aparecerá após duas coletas de histórico.</div>';$("historyDelta").textContent="—";return}
  const closings=new Map();
  daily.forEach(row=>closings.set(row.datetime.slice(0,7),row.total_portfolio_value_usdt));
  const availableMonths=[...closings.keys()].sort();
  const firstParts=availableMonths[0].split("-").map(Number);const lastParts=availableMonths.at(-1).split("-").map(Number);
  const data=[];let carriedValue=null;
  for(let year=firstParts[0],month=firstParts[1];year<lastParts[0]||(year===lastParts[0]&&month<=lastParts[1]);month++){
    if(month===13){year++;month=1}
    const key=`${year}-${String(month).padStart(2,"0")}`;
    if(closings.has(key))carriedValue=closings.get(key);
    if(carriedValue!==null)data.push({datetime:`${key}-01T12:00:00`,total_portfolio_value_usdt:carriedValue,observed:closings.has(key)});
  }
  const width=900,height=270,p={l:58,r:18,t:15,b:34};const values=data.map(x=>x.total_portfolio_value_usdt);let min=Math.min(...values),max=Math.max(...values);const spread=max-min||1;min-=spread*.1;max+=spread*.1;
  const x=i=>p.l+i*(width-p.l-p.r)/(data.length-1);const y=v=>p.t+(max-v)*(height-p.t-p.b)/(max-min);const line=data.map((row,i)=>`${i?"L":"M"} ${x(i).toFixed(1)} ${y(row.total_portfolio_value_usdt).toFixed(1)}`).join(" ");const area=`${line} L ${x(data.length-1)} ${height-p.b} L ${x(0)} ${height-p.b} Z`;
  const grid=[0,.25,.5,.75,1].map(r=>{const yy=p.t+r*(height-p.t-p.b);const value=max-r*(max-min);return `<line class="grid-line" x1="${p.l}" y1="${yy}" x2="${width-p.r}" y2="${yy}"/><text class="axis-label" x="0" y="${yy+4}">${escapeHtml(shortUsd(value))}</text>`}).join("");
  const labelStep=Math.max(1,Math.ceil(data.length/18));const labelIndexes=data.map((_,i)=>i).filter(i=>i%labelStep===0||i===data.length-1);
  const labels=labelIndexes.map(i=>`<text class="axis-label month-label" x="${x(i)}" y="${height-7}" text-anchor="${i===0?"start":i===data.length-1?"end":"middle"}">${new Intl.DateTimeFormat("pt-BR",{month:"short",year:"2-digit"}).format(new Date(data[i].datetime)).replace(".","").replace(" de ","/")}</text>`).join("");
  const points=data.map((row,i)=>{const monthLabel=new Intl.DateTimeFormat("pt-BR",{month:"long",year:"numeric"}).format(new Date(row.datetime));const valueLabel=usd(row.total_portfolio_value_usdt);return `<circle class="chart-dot month-dot${row.observed?"":" carried"}" cx="${x(i)}" cy="${y(row.total_portfolio_value_usdt)}" r="${i===data.length-1?5:3}" tabindex="0" data-label="${escapeHtml(monthLabel)}" data-value="${escapeHtml(valueLabel)}" aria-label="${escapeHtml(`${monthLabel}: ${valueLabel}`)}"></circle>`}).join("");
  $("historyChart").innerHTML=`<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><defs><linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0b90b" stop-opacity=".28"/><stop offset="1" stop-color="#f0b90b" stop-opacity="0"/></linearGradient></defs>${grid}<path class="area-fill" d="${area}"/><path class="chart-line" d="${line}"/>${points}${labels}</svg><div id="historyTooltip" class="history-tooltip" role="tooltip" hidden><small></small><strong></strong></div>`;
  initializeHistoryTooltip();
  const delta=(values.at(-1)/values[0]-1)*100;$("historyDelta").textContent=`${percent(delta)} no período`;$("historyDelta").className=`delta ${signClass(delta)}`;
}

function initializeHistoryTooltip(){
  const chart=$("historyChart");const tooltip=$("historyTooltip");if(!tooltip)return;
  const show=point=>{
    tooltip.querySelector("small").textContent=point.dataset.label;
    tooltip.querySelector("strong").textContent=point.dataset.value;
    tooltip.hidden=false;
    const chartRect=chart.getBoundingClientRect();const pointRect=point.getBoundingClientRect();
    const center=pointRect.left+pointRect.width/2-chartRect.left;
    const maxLeft=Math.max(10,chartRect.width-tooltip.offsetWidth-10);
    tooltip.style.left=`${Math.min(Math.max(center-tooltip.offsetWidth/2,10),maxLeft)}px`;
    const above=pointRect.top-chartRect.top-tooltip.offsetHeight-12;
    tooltip.style.top=`${above>=4?above:pointRect.bottom-chartRect.top+12}px`;
  };
  const hide=()=>{tooltip.hidden=true};
  chart.querySelectorAll(".month-dot").forEach(point=>{
    point.addEventListener("mouseenter",()=>show(point));
    point.addEventListener("mouseleave",hide);
    point.addEventListener("focus",()=>show(point));
    point.addEventListener("blur",hide);
  });
}

function renderAssets(){
  const base=filteredBalances();
  const searchable=(value,formatted="")=>normalizeFilter(`${value??""} ${formatted}`);
  const filtered=base.filter(x=>{
    const fields={
      asset:normalizeFilter(`${x.asset} ${x.sources.join(" ")}`),
      quantity:searchable(x.total_balance,number(x.total_balance)),
      price:searchable(x.current_price_usdt,usd(x.current_price_usdt,x.current_price_usdt<.01?6:2)),
      change24h:searchable(x.price_change_percent_24h,percent(x.price_change_percent_24h)),
      value:searchable(x.current_value_usdt,usd(x.current_value_usdt)),
      average:x.cost_basis_unavailable?normalizeFilter("indisponivel copy spot"):x.acquired_free?normalizeFilter("recebido gratuito"):searchable(x.average_buy_price_usdt,usd(x.average_buy_price_usdt,x.average_buy_price_usdt<.01?6:2)),
      result:x.cost_basis_unavailable?normalizeFilter("indisponivel copy spot"):searchable(x.profit_loss_usdt,usd(x.profit_loss_usdt)),
      roi:x.cost_basis_unavailable?normalizeFilter("indisponivel copy spot"):searchable(x.profit_loss_percent,percent(x.profit_loss_percent))
    };
    return Object.entries(state.columnFilters).every(([key,value])=>!value||fields[key].includes(normalizeFilter(value)));
  });
  const hasColumnFilters=Object.values(state.columnFilters).some(Boolean);$("clearColumnFilters").hidden=!hasColumnFilters;
  $("visibleAssets").textContent=`${filtered.length} de ${base.length} ativos`;
  $("assetsTable").innerHTML=filtered.map(x=>{const unavailable='<span class="number-sub copy-unavailable">Indisponível no Copy Spot</span>';return `<tr><td><div class="asset-cell"><span class="asset-badge">${escapeHtml(x.asset.slice(0,4))}</span><span class="asset-name"><strong>${escapeHtml(x.asset)}</strong><small>${escapeHtml(x.sources.join(" + "))}</small></span></div></td><td>${number(x.total_balance)}</td><td>${usd(x.current_price_usdt,x.current_price_usdt<.01?6:2)}</td><td class="${signClass(x.price_change_percent_24h)}">${percent(x.price_change_percent_24h)}</td><td><strong>${usd(x.current_value_usdt)}</strong></td><td>${x.cost_basis_unavailable?unavailable:x.acquired_free?'<span class="number-sub">Recebido/gratuito</span>':usd(x.average_buy_price_usdt,x.average_buy_price_usdt<.01?6:2)}</td><td class="${signClass(x.profit_loss_usdt)}">${x.cost_basis_unavailable?"—":usd(x.profit_loss_usdt)}</td><td class="${signClass(x.profit_loss_percent)}">${x.cost_basis_unavailable?"—":percent(x.profit_loss_percent)}</td></tr>`}).join("")||'<tr><td colspan="8"><div class="empty-state">Nenhum ativo encontrado.</div></td></tr>';
}

function normalizeFilter(value){return String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").toLowerCase()}

function rankingMarkup(items){return items.map(x=>`<div class="ranking-item"><span class="ranking-symbol">${escapeHtml(x.asset.slice(0,4))}</span><span class="ranking-info"><strong>${escapeHtml(x.asset)}</strong><small>${usd(x.current_value_usdt)} em carteira</small></span><span class="ranking-result"><strong class="${signClass(x.profit_loss_percent)}">${percent(x.profit_loss_percent)}</strong><small>${usd(x.profit_loss_usdt)}</small></span></div>`).join("")||'<div class="empty-state">Sem ativos com custo de compra.</div>'}
function renderRankings(){const eligible=filteredBalances().filter(x=>!x.acquired_free&&!x.cost_basis_unavailable&&Number.isFinite(x.profit_loss_percent));const best=[...eligible].sort((a,b)=>b.profit_loss_percent-a.profit_loss_percent).slice(0,5);const worst=[...eligible].sort((a,b)=>a.profit_loss_percent-b.profit_loss_percent).slice(0,5);$("bestAssets").innerHTML=rankingMarkup(best);$("worstAssets").innerHTML=rankingMarkup(worst)}

function quoteValue(value,quote,digits=2){if(["USDT","USDC","FDUSD"].includes(quote))return usd(value,digits);if(quote==="BRL")return brl(value);return `${number(value,digits)} ${quote||""}`.trim()}
function renderTransactions(){const rows=state.data.transactions.filter(x=>!state.filter||`${x.asset} ${x.symbol}`.toLowerCase().includes(state.filter)).slice(0,100);$("transactionsTable").innerHTML=rows.map(x=>`<tr><td>${new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short",timeZone:"UTC"}).format(new Date(x.time))}</td><td><span class="asset-name"><strong>${escapeHtml(x.asset)}</strong><small>${escapeHtml(x.symbol)}</small></span></td><td><span class="trade-type ${x.isBuyer?"buy":"sell"}">${x.isBuyer?"COMPRA":"VENDA"}</span></td><td>${number(x.qty)}</td><td>${quoteValue(x.price,x.quoteAsset,x.price<.01?6:2)}</td><td><strong>${quoteValue(x.quoteQty,x.quoteAsset)}</strong></td></tr>`).join("")||'<tr><td colspan="6"><div class="empty-state">Nenhuma negociação Spot encontrada nos pares identificados.</div></td></tr>'}
function renderFiat(){const rows=state.data.fiat_history.slice(0,100);$("fiatHistoryTable").innerHTML=rows.map(x=>`<tr><td>${escapeHtml(x.timestamp_human)}</td><td>${x.type==="Order"?"Ordem":"Depósito"}</td><td>${escapeHtml(x.fiatCurrency||"—")}</td><td><strong>${x.fiatCurrency==="BRL"?brl(Number(x.amount)):number(Number(x.amount),2)}</strong></td><td>${escapeHtml(x.status||"—")}</td><td>${escapeHtml(x.method||"—")}</td></tr>`).join("")||'<tr><td colspan="6"><div class="empty-state">Nenhuma movimentação fiat encontrada.</div></td></tr>'}
function renderOpenOrders(){const rows=(state.data.open_orders||[]).filter(x=>!state.filter||`${x.asset} ${x.symbol}`.toLowerCase().includes(state.filter));$("openOrdersTable").innerHTML=rows.map(x=>`<tr><td>${formatTime(x.time)}</td><td><strong>${escapeHtml(x.symbol)}</strong></td><td><span class="trade-type ${x.side==="BUY"?"buy":"sell"}">${x.side==="BUY"?"COMPRA":"VENDA"}</span></td><td>${escapeHtml(x.type||"—")}</td><td>${usd(x.price,x.price<.01?6:2)}</td><td>${number(x.quantity)}</td><td>${number(x.executed_quantity)}</td><td>${escapeHtml(x.status||"—")}</td></tr>`).join("")||'<tr><td colspan="8"><div class="empty-state">Nenhuma ordem aberta.</div></td></tr>'}
function renderCryptoMovements(){const rows=(state.data.crypto_movements||[]).filter(x=>!state.filter||x.asset.toLowerCase().includes(state.filter)).slice(0,100);$("cryptoMovementsTable").innerHTML=rows.map(x=>`<tr><td>${escapeHtml(x.timestamp_human)}</td><td><span class="trade-type ${x.type==="deposit"?"buy":"sell"}">${x.type==="deposit"?"DEPÓSITO":"SAQUE"}</span></td><td><strong>${escapeHtml(x.asset)}</strong></td><td>${number(x.amount)}</td><td>${escapeHtml(x.network)}</td><td>${escapeHtml(x.status)}</td><td class="tx-id" title="${escapeHtml(x.tx_id)}">${escapeHtml(shortId(x.tx_id))}</td></tr>`).join("")||'<tr><td colspan="7"><div class="empty-state">Nenhuma movimentação cripto encontrada.</div></td></tr>'}
function formatTime(value){return value?new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short",timeZone:"UTC"}).format(new Date(value)):"—"}
function shortId(value){if(!value)return"—";return value.length>18?`${value.slice(0,8)}…${value.slice(-6)}`:value}
function renderEmpty(){["portfolioUsd","investedUsd","pnlUsd","assetCount"].forEach(id=>{$(id).classList.remove("skeleton");$(id).textContent="—"});$("lastUpdated").textContent="Falha na atualização"}

function setPrivacy(hidden){
  document.body.classList.toggle("privacy-mode",hidden);
  const button=$("privacyToggle");
  button.setAttribute("aria-pressed",String(hidden));
  button.setAttribute("aria-label",hidden?"Mostrar valores":"Ocultar valores");
  button.title=hidden?"Mostrar valores":"Ocultar valores";
  try{localStorage.setItem("crypto-privacy-hidden",hidden?"1":"0")}catch(_error){}
}

$("refreshButton").addEventListener("click",()=>loadData(true));
$("privacyToggle").addEventListener("click",()=>setPrivacy(!document.body.classList.contains("privacy-mode")));
$("assetSearch").addEventListener("input",event=>{state.filter=event.target.value.trim().toLowerCase();if(state.data){renderSummary();renderInsights();renderAllocation();renderHistory();renderAssets();renderRankings();renderTransactions();renderOpenOrders();renderCryptoMovements()}});
document.querySelectorAll("[data-column-filter]").forEach(input=>input.addEventListener("input",event=>{state.columnFilters[event.target.dataset.columnFilter]=event.target.value.trim();if(state.data)renderAssets()}));
$("clearColumnFilters").addEventListener("click",()=>{Object.keys(state.columnFilters).forEach(key=>state.columnFilters[key]="");document.querySelectorAll("[data-column-filter]").forEach(input=>input.value="");if(state.data)renderAssets()});
document.querySelectorAll(".tab").forEach(button=>button.addEventListener("click",()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));button.classList.add("active");document.querySelectorAll(".activity-table").forEach(table=>table.hidden=table.id!==`${button.dataset.tab}Table`)}));
try{setPrivacy(localStorage.getItem("crypto-privacy-hidden")==="1")}catch(_error){setPrivacy(false)}
loadData();

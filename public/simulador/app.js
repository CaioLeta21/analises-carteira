/* Simulador: lê /data/simulador.json (atualizado todo dia) e, se houver, a carteira salva
   neste navegador (nada sai do aparelho). */
(async function(){
'use strict';
let S, MERC;
try {
  [S, MERC] = await Promise.all([
    fetch('/data/simulador.json', {cache:'no-cache'}).then(r=>{ if(!r.ok) throw new Error(r.status); return r.json(); }),
    fetch('/data/mercado.json', {cache:'no-cache'}).then(r=>r.ok?r.json():null).catch(()=>null),
  ]);
} catch(e) {
  document.querySelector('.wrap').insertAdjacentHTML('afterbegin','<p style="color:var(--bad)">Não foi possível carregar os dados agora. Tente de novo em alguns minutos.</p>');
  return;
}
const N = S.months.length;
const CATS = [
  {k:'rfbr', name:'Renda fixa Brasil', color:'#2E6BB5', br:true},
  {k:'rfex', name:'Renda fixa exterior', color:'#2BA58A', br:false},
  {k:'ouro', name:'Ouro', color:'#C9A227', br:false},
  {k:'alt',  name:'Alternativos', color:'#8C8C8C', br:false},
  {k:'rvex', name:'Renda variável exterior', color:'#E07B39', br:false},
  {k:'rvbr', name:'Renda variável Brasil', color:'#D97AA5', br:true},
  {k:'btc',  name:'Bitcoin', color:'#F7931A', br:false},
];
// Antes de out/2014 não há série confiável do bitcoin: nesses meses a fatia dele rende o CDI.
if (!S.btc) S.btc = S.rfbr.map(()=>null);
const BTC_INI = S.months[S.btc.findIndex(x=>x!==null)] || null;
S.btc = S.btc.map((x,i)=> x===null ? S.rfbr[i] : x);
// Exemplos genéricos. "minha" é preenchida com a carteira salva neste navegador, se houver.
const PRESETS = {
  cons:{rfbr:70, rfex:15, ouro:5, alt:0, rvex:5, rvbr:5, btc:0},
  mod:{rfbr:45, rfex:15, ouro:8, alt:5, rvex:17, rvbr:10, btc:0},
  arr:{rfbr:25, rfex:10, ouro:10, alt:5, rvex:35, rvbr:15, btc:0},
};
const NOMES_PRESET = {cons:'Conservadora', mod:'Moderada', arr:'Arrojada', minha:'Minha carteira'};
const MN = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const mlabel = m => MN[+m.slice(5)-1] + '/' + m.slice(0,4);
const fmt = (x, d=1) => x.toLocaleString('pt-BR', {minimumFractionDigits:d, maximumFractionDigits:d});
const pct = (x, d=1) => fmt(x*100, d) + '%';
const sgn = (x, d=1) => (x>0?'+':x<0?'−':'') + fmt(Math.abs(x*100), d) + '%';

let W = {...PRESETS.mod};
let active = 'mod';

function norm(w){ const t = CATS.reduce((a,c)=>a+(w[c.k]||0),0) || 1; const o={}; CATS.forEach(c=>o[c.k]=(w[c.k]||0)/t); return o; }

function stats(wRaw){
  const w = norm(wRaw);
  const rr = new Array(N), ru = new Array(N);
  for(let i=0;i<N;i++){ let x=0; for(const c of CATS) x += w[c.k]*S[c.k][i]; rr[i]=x; ru[i]=(1+x)/(1+S.fx[i])-1; }
  const sd = a => { const m=a.reduce((s,v)=>s+v,0)/a.length; return Math.sqrt(a.reduce((s,v)=>s+(v-m)*(v-m),0)/(a.length-1))*Math.sqrt(12); };
  const path = a => { const idx=[1]; for(const x of a) idx.push(idx[idx.length-1]*(1+x)); return idx; };
  const ib = path(rr), iu = path(ru);
  const dd = idx => { let pk=idx[0], pi=0, m=0, from=0, to=0; const series=[]; for(let i=0;i<idx.length;i++){ if(idx[i]>pk){pk=idx[i];pi=i;} const d=idx[i]/pk-1; series.push(d); if(d<m){m=d;from=pi;to=i;} } let rec=null; for(let i=to;i<idx.length;i++){ if(idx[i]>=idx[from]){rec=i;break;} } return {m,from,to,rec,series}; };
  const db = dd(ib), du = dd(iu);
  let w12 = Infinity, w12i = 0; for(let i=0;i+12<ib.length;i++){ const r=ib[i+12]/ib[i]-1; if(r<w12){w12=r;w12i=i+12;} }
  const neg = rr.filter(x=>x<0).length/N;
  const mult = ib[ib.length-1];
  const years = {}; [2008,2015,2020,2022].forEach(y=>{ let p=1; for(let i=0;i<N;i++) if(S.months[i].startsWith(String(y))) p*=1+rr[i]; years[y]=p-1; });
  return {vol:sd(rr), volU:sd(ru), cagr:Math.pow(mult,12/N)-1, mult, db, du, w12, w12i, neg, years, ib};
}

const allMonths = ['2006-10', ...S.months];
const cdiIdx = (()=>{ const idx=[1]; for(const x of S.rfbr) idx.push(idx[idx.length-1]*(1+x)); return idx; })();
const cdiYears = {}; [2008,2015,2020,2022].forEach(y=>{ let p=1; for(let i=0;i<N;i++) if(S.months[i].startsWith(String(y))) p*=1+S.rfbr[i]; cdiYears[y]=p-1; });
let R1 = 'cons', R2 = 'mod';
let REF = {hoje: stats(PRESETS[R1]), D: stats(PRESETS[R2])};
const L = () => [NOMES_PRESET[R1], NOMES_PRESET[R2]];

function bandOf(v){
  if(v<0.04) return {i:0, t:'Conservadora', c:'var(--good)'};
  if(v<0.08) return {i:1, t:'Moderada', c:'var(--accent)'};
  if(v<0.12) return {i:2, t:'Arrojada', c:'var(--warn)'};
  return {i:3, t:'Agressiva', c:'var(--bad)'};
}

const rowsEl = document.getElementById('rows');
CATS.forEach(c=>{
  const r = document.createElement('div'); r.className='row';
  r.innerHTML = `<span class="sw" style="background:${c.color}"></span>
    <label class="lbl" for="r-${c.k}">${c.name} <small id="v-${c.k}"></small></label>
    <input type="number" id="n-${c.k}" min="0" max="100" step="0.5" aria-label="${c.name} em %">
    <span></span>
    <input type="range" id="r-${c.k}" min="0" max="100" step="0.5">`;
  rowsEl.appendChild(r);
  const rng = r.querySelector('#r-'+c.k), num = r.querySelector('#n-'+c.k);
  rng.addEventListener('input', ()=>setWeight(c.k, parseFloat(rng.value)));
  num.addEventListener('change', ()=>setWeight(c.k, parseFloat(num.value)||0));
});
document.getElementById('legend').innerHTML = CATS.map(c=>`<span><i style="background:${c.color}"></i>${c.name}</span>`).join('');

function setWeight(k, v){
  v = Math.max(0, Math.min(100, v));
  if(document.getElementById('lock').checked){
    const others = CATS.map(c=>c.k).filter(x=>x!==k);
    const rest = 100 - v; const sumO = others.reduce((a,x)=>a+W[x],0);
    if(sumO <= 1e-9) others.forEach(x=>W[x]=rest/others.length); else others.forEach(x=>W[x]=W[x]*rest/sumO);
  }
  W[k] = v; active = null; render();
}
document.getElementById('lock').addEventListener('change', render);
document.getElementById('norm').addEventListener('click', ()=>{ const n=norm(W); CATS.forEach(c=>W[c.k]=n[c.k]*100); render(); });
document.getElementById('pat').addEventListener('input', render);
document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click', ()=>{ active=b.dataset.preset; W={...PRESETS[active]}; render(); }));

function css(name){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

let pie, growth, ddc;
const pieLabels = {id:'pieLabels', afterDatasetsDraw(ch){
  const {ctx} = ch; const meta = ch.getDatasetMeta(0); const data = ch.data.datasets[0].data; const tot = data.reduce((a,b)=>a+b,0)||1;
  ctx.save(); ctx.font = '600 12px "IBM Plex Sans", sans-serif'; ctx.fillStyle = '#ffffff'; ctx.textAlign='center'; ctx.textBaseline='middle';
  meta.data.forEach((arc,i)=>{ const p=data[i]/tot; if(p<0.035) return; const a=(arc.startAngle+arc.endAngle)/2; const r=(arc.innerRadius+arc.outerRadius)/2; ctx.fillText(Math.round(p*100)+'%', arc.x+Math.cos(a)*r, arc.y+Math.sin(a)*r); });
  const n = norm(W); const ex = CATS.filter(c=>!c.br).reduce((a,c)=>a+n[c.k],0);
  const cx = (ch.chartArea.left+ch.chartArea.right)/2, cy=(ch.chartArea.top+ch.chartArea.bottom)/2;
  ctx.fillStyle = css('--ink'); ctx.font = '600 22px "IBM Plex Serif", serif'; ctx.fillText(Math.round(ex*100)+'% fora', cx, cy-8);
  ctx.fillStyle = css('--muted'); ctx.font = '400 12.5px "IBM Plex Sans", sans-serif';
  const pat = parseFloat(document.getElementById('pat').value)||0; ctx.fillText('R$ '+fmt(pat,2)+' mi', cx, cy+16);
  ctx.restore();
}};

function buildCharts(){
  const grid = css('--line'), muted = css('--muted'), accent = css('--accent'), bad = css('--bad');
  const labels = allMonths.map(mlabel);
  const xTicks = {color:muted, font:{size:11}, autoSkip:false, maxRotation:0, callback:(v,i)=>{ const m=allMonths[i]; return (m.endsWith('-01') && (+m.slice(0,4))%4===0) ? m.slice(0,4) : ''; }};
  if(pie) pie.destroy(); if(growth) growth.destroy(); if(ddc) ddc.destroy();
  pie = new Chart(document.getElementById('pie'), {type:'doughnut', plugins:[pieLabels],
    data:{labels:CATS.map(c=>c.name), datasets:[{data:CATS.map(c=>W[c.k]), backgroundColor:CATS.map(c=>c.color), borderColor:css('--panel'), borderWidth:2}]},
    options:{responsive:true, maintainAspectRatio:false, cutout:'58%', animation:{duration:150}, plugins:{legend:{display:false}, tooltip:{callbacks:{label:c=>' '+c.label+': '+fmt(c.parsed/ (c.dataset.data.reduce((a,b)=>a+b,0)||1)*100)+'%'}}}}});
  growth = new Chart(document.getElementById('growth'), {type:'line',
    data:{labels, datasets:[
      {label:'Simulada', data:[], borderColor:accent, borderWidth:2.2, pointRadius:0, tension:0},
      {label:L()[0], data:REF.hoje.ib.map(v=>v*100), borderColor:'#8C8C8C', borderDash:[6,4], borderWidth:1.6, pointRadius:0, tension:0},
      {label:'CDI', data:cdiIdx.map(v=>v*100), borderColor:muted, borderDash:[2,3], borderWidth:1.6, pointRadius:0, tension:0}]},
    options:{responsive:true, maintainAspectRatio:false, animation:false, interaction:{mode:'index', intersect:false},
      plugins:{legend:{display:false}, tooltip:{callbacks:{label:c=>' '+c.dataset.label+': R$ '+fmt(c.parsed.y,0)}}},
      scales:{x:{grid:{display:false}, ticks:xTicks}, y:{grid:{color:grid}, border:{display:false}, ticks:{color:muted, font:{size:11}, callback:v=>'R$ '+v}}}}});
  ddc = new Chart(document.getElementById('dd'), {type:'line',
    data:{labels, datasets:[
      {label:'Simulada', data:[], borderColor:bad, backgroundColor:bad+'22', fill:'origin', borderWidth:1.8, pointRadius:0, tension:0},
      {label:L()[0], data:REF.hoje.db.series.map(v=>v*100), borderColor:'#8C8C8C', borderDash:[6,4], borderWidth:1.4, pointRadius:0, tension:0}]},
    options:{responsive:true, maintainAspectRatio:false, animation:false, interaction:{mode:'index', intersect:false},
      plugins:{legend:{display:false}, tooltip:{callbacks:{label:c=>' '+c.dataset.label+': '+fmt(c.parsed.y)+'%'}}},
      scales:{x:{grid:{display:false}, ticks:xTicks}, y:{max:0, grid:{color:grid}, border:{display:false}, ticks:{color:muted, font:{size:11}, callback:v=>v+'%'}}}}});
  document.getElementById('lgA').style.borderTopColor = accent;
  document.getElementById('lgH').style.borderTopColor = '#8C8C8C';
  document.getElementById('lgC').style.borderTopColor = muted;
  document.getElementById('lgDA').style.borderTopColor = bad;
  document.getElementById('lgDH').style.borderTopColor = '#8C8C8C';
  render();
}

function render(){
  const total = CATS.reduce((a,c)=>a+W[c.k],0);
  const lock = document.getElementById('lock').checked;
  const pat = parseFloat(document.getElementById('pat').value)||0;
  const n = norm(W);
  CATS.forEach(c=>{
    document.getElementById('r-'+c.k).value = W[c.k];
    const ne = document.getElementById('n-'+c.k); if(document.activeElement!==ne) ne.value = (Math.round(W[c.k]*10)/10).toString();
    document.getElementById('v-'+c.k).textContent = 'R$ ' + fmt(n[c.k]*pat, 2) + ' mi';
  });
  document.getElementById('thR1').textContent = L()[0]; document.getElementById('thR2').textContent = L()[1];
  document.getElementById('lgHt').textContent = L()[0]; document.getElementById('lgDHt').textContent = L()[0];
  const tb = document.getElementById('totalbox'); const off = Math.abs(total-100) > 0.05;
  document.getElementById('total').textContent = fmt(total) + '%';
  tb.classList.toggle('off', off); document.getElementById('norm').hidden = !off || lock;
  document.querySelectorAll('[data-preset]').forEach(b=>b.setAttribute('aria-pressed', String(b.dataset.preset===active)));

  const br = CATS.filter(c=>c.br).reduce((a,c)=>a+n[c.k],0);
  document.getElementById('sbBr').style.cssText = `width:${br*100}%;background:#2E6BB5`;
  document.getElementById('sbEx').style.cssText = `width:${(1-br)*100}%;background:#E07B39`;
  document.getElementById('slBr').textContent = 'Brasil ' + pct(br,0);
  document.getElementById('slEx').textContent = 'Exterior (inclui ouro e bitcoin) ' + pct(1-br,0);

  const s = stats(W), H = REF.hoje, D = REF.D;
  const [L1, L2] = L();
  const cmp = (a,b,d=1,f=pct) => `${L1} ${f(a,d)} · ${L2} ${f(b,d)}`;
  document.getElementById('mVol').textContent = pct(s.vol);
  document.getElementById('cVol').textContent = cmp(H.vol, D.vol) + (s.vol>H.vol ? ` · ${fmt(s.vol/H.vol,1)}x a de ${L1.toLowerCase()}` : '');
  const b = bandOf(s.vol); const band = document.getElementById('band'); band.textContent = b.t; band.style.color = b.c;
  const sc = document.getElementById('scale'); sc.style.color = b.c; [...sc.children].forEach((el,i)=>el.classList.toggle('on', i<=b.i));
  document.getElementById('mVolU').textContent = pct(s.volU);
  document.getElementById('cVolU').textContent = cmp(H.volU, D.volU);
  document.getElementById('mRet').textContent = pct(s.cagr);
  document.getElementById('cRet').textContent = `R$ 100 → R$ ${fmt(s.mult*100,0)} · ${L1} R$ ${fmt(H.mult*100,0)} · ${L2} R$ ${fmt(D.mult*100,0)}`;
  document.getElementById('mDD').textContent = sgn(s.db.m);
  const recTxt = s.db.rec!==null ? `voltou em ${s.db.rec - s.db.from} meses` : 'ainda não voltou';
  document.getElementById('cDD').textContent = s.db.m<0 ? `R$ ${fmt(-s.db.m*pat,2)} mi · ${mlabel(allMonths[s.db.from])} a ${mlabel(allMonths[s.db.to])} · ${recTxt}` : 'nenhuma queda';
  document.getElementById('mDDU').textContent = sgn(s.du.m);
  document.getElementById('cDDU').textContent = s.du.m<0 ? `${mlabel(allMonths[s.du.from])} a ${mlabel(allMonths[s.du.to])} · ${L1} ${sgn(H.du.m)} · ${L2} ${sgn(D.du.m)}` : '';
  document.getElementById('m12').textContent = sgn(s.w12);
  document.getElementById('c12').textContent = `até ${mlabel(allMonths[s.w12i])} · ${L1} ${sgn(H.w12)} · ${L2} ${sgn(D.w12)}`;
  document.getElementById('mNeg').textContent = pct(s.neg,0);
  document.getElementById('cNeg').textContent = `${L1} ${pct(H.neg,0)} · ${L2} ${pct(D.neg,0)} · CDI 0%`;
  const ylab = {2008:'2008 (crise global)', 2015:'2015 (recessão no Brasil)', 2020:'2020 (pandemia)', 2022:'2022 (juros altos lá fora)'};
  document.getElementById('years').innerHTML = [2008,2015,2020,2022].map(y=>{
    const cell = v => `<td class="${v<0?'neg':''}">${sgn(v)}</td>`;
    return `<tr><td>${ylab[y]}</td>${cell(s.years[y])}${cell(H.years[y])}${cell(D.years[y])}${cell(cdiYears[y])}</tr>`; }).join('');

  if(pie){ pie.data.datasets[0].data = CATS.map(c=>W[c.k]); pie.update(); }
  if(growth){ growth.data.datasets[0].data = s.ib.map(v=>v*100); growth.update('none'); }
  if(ddc){ ddc.data.datasets[0].data = s.db.series.map(v=>v*100); ddc.update('none'); }
}

function start(){ if(window.Chart){ buildCharts(); } else { render(); } }
await prepararMinhaCarteira();
new MutationObserver(()=>window.Chart && buildCharts()).observe(document.documentElement, {attributes:true, attributeFilter:['data-theme']});
try{ matchMedia('(prefers-color-scheme: dark)').addEventListener('change', ()=>window.Chart && buildCharts()); }catch(e){}
start();

async function prepararMinhaCarteira(){
  const MN2 = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  const ml = m => MN2[+m.slice(5)-1] + '/' + m.slice(0,4);
  document.getElementById('sub').textContent = `Mexa nas categorias e veja o risco em ${Math.round(N/12)} anos de dados mensais (${ml(S.months[0])} a ${ml(S.months[N-1])}${S.parcial?', mês parcial':''}), em reais.`;
  if (MERC && MERC.data_ref) document.getElementById('dataref').textContent = 'Dados até ' + new Date(MERC.data_ref+'T12:00:00').toLocaleDateString('pt-BR') + '.';
  // pesos vindos da página Minha carteira pelo endereço: #pesos=rfbr:40,rfex:15,...&pat=1.2
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get('pesos')) {
    const w = {}; h.get('pesos').split(',').forEach(p => { const [k,v] = p.split(':'); if (k in W) w[k] = Math.max(0, parseFloat(v)||0); });
    if (Object.keys(w).length) { CATS.forEach(c => W[c.k] = w[c.k] || 0); active = null; }
    if (h.get('pat')) document.getElementById('pat').value = h.get('pat');
  }
  try {
    const lista = await CarteiraArmazenamento.listar();
    if (lista.length && MERC) {
      const c = lista.sort((a,b) => b.atualizadaEm.localeCompare(a.atualizadaEm))[0];
      const { pesos, total } = CarteiraModelo.pesosPorCategoria(c, CarteiraModelo.precosAtuais(MERC));
      if (total > 0 || c.modo === 'categorias') {
        PRESETS.minha = Object.fromEntries(CATS.map(k => [k.k, Math.round(pesos[k.k]*1000)/10]));
        NOMES_PRESET.minha = c.nome || 'Minha carteira';
        const b = document.querySelector('[data-preset="minha"]'); b.hidden = false; b.textContent = NOMES_PRESET.minha;
        R1 = 'minha'; REF = {hoje: stats(PRESETS.minha), D: stats(PRESETS[R2])};
        if (window.Chart) buildCharts(); else render();
      }
    }
  } catch(e) { console.warn('carteira local indisponível', e); }
  document.getElementById('salvar').addEventListener('click', async () => {
    const c = CarteiraModelo.novaCarteira('Simulação de ' + new Date().toLocaleDateString('pt-BR'));
    c.modo = 'categorias'; c.categorias = Object.fromEntries(CATS.map(k => [k.k, Math.round(W[k.k]*100)/100]));
    c.patrimonio = Math.round((parseFloat(document.getElementById('pat').value)||0) * 1e6);
    await CarteiraArmazenamento.salvar(c);
    document.getElementById('salvo').textContent = 'Salva neste navegador. Veja em Minha carteira.';
  });
  render();
}
})();

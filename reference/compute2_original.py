import csv, math, statistics
L='/home/claude/dez_anos/longo/'; D='/home/claude/dez_anos/data/'; O='/home/claude/dez_anos/out2/'
fx={r['month']:float(r['usdbrl']) for r in csv.DictReader(open(L+'usdbrl_full.csv'))}
def nxt(m):
    y,mm=map(int,m.split('-')); mm+=1
    if mm==13: y+=1; mm=1
    return f'{y}-{mm:02d}'
def prv(m,k=1):
    y,mm=map(int,m.split('-')); mm-=k
    while mm<=0: mm+=12; y-=1
    return f'{y}-{mm:02d}'
def sections(f):
    out={}; cur=None
    for l in open(f):
        l=l.strip()
        if not l: continue
        if l.startswith('#'): cur=l[1:].split()[0]; out[cur]={}; continue
        m,v=l.split(','); out[cur][m]=float(v)
    return out
END='2026-10'
early=sections(L+'us_early.txt'); late=sections(D+'raw_digrin.txt')
P={}; SRC={}; CUR={}
for t in ['GOOGL','LLY','BLK','NVO','QQQ','TSLA']:
    P[t]={**early[t],**late[t]}; CUR[t]='USD'; SRC[t]={m:'Digrin (preço ajustado)' for m in P[t]}
def mr(f):
    d={}
    for l in open(f):
        p=l.strip().split(';'); y=int(p[0])
        for i,v in enumerate(p[1:13]):
            if v!='--': d[f'{y}-{i+1:02d}']=float(v.replace('%','').replace(',','.'))/100
    return d
anchor={'ITUB3':43.06,'EGIE3':26.26,'PSSA3':44.75,'WEGE3':48.36,'TAEE11':39.59,'CSMG3':48.11}
first={'ITUB3':'2004-08','EGIE3':'2004-08','PSSA3':'2004-11','WEGE3':'2004-08','TAEE11':'2012-05','CSMG3':'2006-02'}
for t in ['ITUB3','EGIE3','PSSA3','WEGE3','TAEE11','CSMG3']:
    r=mr(L+f'mr_{t.lower()}.txt'); src={m:'Mais Retorno (retorno mensal)' for m in r}
    if t=='PSSA3': r['2026-10']=-0.0537; src['2026-10']='Investidor10 (retorno de 1 mês até 30/out)'
    p={END:anchor[t]}; m=END
    while m>first[t]:
        p[prv(m)]=p[m]/(1+r[m]); m=prv(m)
    P[t]=p; CUR[t]='BRL'; SRC[t]={m:src.get(m,'Mais Retorno (retorno mensal)') for m in p}
    SRC[t][END]=src[END]+'; preço ancorado no fechamento de 30/out/2026 ('+('investimentos.com.br' if t in ('TAEE11','CSMG3') else 'Investidor10')+')'
# DIVO11
def parse(f):
    d={}
    for line in open(f):
        q=line.strip().split(';'); y=int(q[0])
        for i,v in enumerate(q[1:]):
            d[f'{y}-{i+1:02d}']=float(v.replace('%','').replace(',','.'))/100
    return d
meus=parse('/home/claude/dez_anos/data/divo_meus.txt'); etf=parse('/home/claude/dez_anos/data/divo_etfsbrasil.txt')
shift={prv(m):v for m,v in meus.items()}  # value labeled m is return of m-1
p={END:119.74}; m=END
while m>'2015-11':
    rr=etf[m] if m>='2024-01' else shift[m]
    p[prv(m)]=p[m]/(1+rr); m=prv(m)
P['DIVO11']=p; CUR['DIVO11']='BRL'
SRC['DIVO11']={m:('ETFs Brasil (retorno mensal)' if m>='2024-01' else 'Meus Dividendos (retorno mensal, realinhado)') for m in p}
SRC['DIVO11'][END]='ETFs Brasil (retorno mensal); cota de 30/out/2026'
# SXLV: XLV (Digrin) calibrado aos retornos anuais oficiais da SSGA; set-out/2026 = fechamentos reais na LSE
import json
P['SXLV']=json.load(open('/home/claude/dez_anos/data/sxlv_mensal.json')); CUR['SXLV']='USD'
SRC['SXLV']={m:'SSGA (retorno anual oficial) com padrão mensal do XLV (Digrin)' for m in P['SXLV']}
for m in ('2026-09','2026-10'): SRC['SXLV'][m]='Fechamento do SXLV na Bolsa de Londres (stockanalysis)'
# CDI: taxa acumulada no mês (BCB SGS 4391), capitalizada a partir de 100 no fim de ago/2004
cdi={}
for l in open('/home/claude/dez_anos/data/cdi_4391.txt'):
    m,v=l.strip().split(','); cdi[m]=float(v)/100
p={'2004-08':100.0}; m='2004-08'
while m<END: m=nxt(m); p[m]=p[prv(m)]*(1+cdi[m])
P['CDI']=p; CUR['CDI']='BRL'; SRC['CDI']={m:'Banco Central (SGS 4391, CDI acumulado no mês)' for m in p}
# BTEC: IBB (Digrin) calibrado aos retornos anuais oficiais da BlackRock (2018 a set/2026); antes disso e em out/2026, IBB
_b=json.load(open('/home/claude/dez_anos/data/btec_mensal.json'))
P['BTEC']=_b['p']; CUR['BTEC']='USD'; SRC['BTEC']=_b['src']
# IUUS: XLU (Digrin) calibrado aos retornos anuais oficiais da BlackRock (2018 a set/2026); antes disso e em out/2026, XLU
_u=json.load(open('/home/claude/dez_anos/data/iuus_mensal.json'))
P['IUUS']=_u['p']; CUR['IUUS']='USD'; SRC['IUUS']=_u['src']
# MSCI World ex USA (líquido, USD): 90% EFA + 10% EWC (Digrin) calibrados aos retornos anuais líquidos da MSCI
_x=json.load(open('/home/claude/dez_anos/data/mxwou_mensal.json'))
P['MXWOU']=_x['p']; CUR['MXWOU']='USD'; SRC['MXWOU']=_x['src']
# IFIX: retornos mensais da Mais Retorno, encadeados a partir de 1.000 pontos em 30/12/2010 (data-base do índice, B3)
_r=mr(L+'mr_ifix.txt'); p={'2010-12':1000.0}; m='2010-12'
while m<END: m=nxt(m); p[m]=p[prv(m)]*(1+_r[m])
P['IFIX']=p; CUR['IFIX']='BRL'; SRC['IFIX']={m:'Mais Retorno (retorno mensal do IFIX)' for m in p}
SRC['IFIX']['2010-12']='Data-base do IFIX: 1.000 pontos em 30/12/2010 (B3)'
# VHYL: Vanguard FTSE All-World High Dividend Yield UCITS; retornos anuais oficiais da Vanguard com padrão mensal de 40% VYM + 60% VYMI (Digrin)
_v=json.load(open('/home/claude/dez_anos/data/vhyl_mensal.json'))
P['VHYL']=_v['p']; CUR['VHYL']='USD'; SRC['VHYL']=_v['src']
# SPY (S&P 500): preço ajustado mensal da Digrin, ago/2004 a out/2026
P['SPY']={l.split(',')[0]:float(l.split(',')[1]) for l in open('/home/claude/dez_anos/data/spy_digrin.txt') if l.split(',')[0]>='2004-08'}; CUR['SPY']='USD'
SRC['SPY']={m:'Digrin (preço ajustado)' for m in P['SPY']}
# BTC: fechamento mensal em dólar da Digrin (BTC-USD), a partir de dez/2010
P['BTC']={l.split(',')[0]:float(l.split(',')[1]) for l in open('/home/claude/dez_anos/data/btc_digrin.txt') if l.split(',')[0]>='2010-12'}; CUR['BTC']='USD'
SRC['BTC']={m:'Digrin (fechamento do mês, BTC-USD)' for m in P['BTC']}
ORD=['ITUB3','EGIE3','PSSA3','WEGE3','TAEE11','CSMG3','DIVO11','BLK','GOOGL','LLY','TSLA','QQQ','SPY','VHYL','BTC','CDI']
NOMES={'BTC':'Bitcoin','TAEE11':'Taesa','CSMG3':'Copasa','ITUB3':'Itaú ON','EGIE3':'Engie Brasil','PSSA3':'Porto Seguro','DIVO11':'ETF DIVO11','BLK':'BlackRock','GOOGL':'Alphabet (Google)','LLY':'Eli Lilly','TSLA':'Tesla','NVO':'Novo Nordisk','QQQ':'ETF QQQ (Nasdaq-100)','SXLV':'ETF SXLV (saúde EUA, Irlanda)','CDI':'CDI (renda fixa, Brasil)','BTEC':'ETF BTEC (biotecnologia, Irlanda)','SPY':'S&P 500 (ETF SPY)','WEGE3':'WEG','IUUS':'ETF IUUS (utilities EUA, Irlanda)','MXWOU':'Índice MSCI World ex USA (desenvolvidos sem EUA)','IFIX':'IFIX (fundos imobiliários, B3)','VHYL':'ETF VHYL (dividendos globais, Vanguard, Irlanda)'}
usd={}; brl={}
for t in ORD:
    usd[t]={}; brl[t]={}
    for m,v in P[t].items():
        if m>END: continue
        if CUR[t]=='BRL': brl[t][m]=v; usd[t][m]=v/fx[m]
        else: usd[t][m]=v; brl[t][m]=v*fx[m]
def months_from(a):
    out=[]; m=a
    while m<=END: out.append(m); m=nxt(m)
    return out
START_IPO='2004-08'
with open(O+'precos_mensais.csv','w',newline='') as f:
    w=csv.writer(f); w.writerow(['mes','ativo','moeda_original','preco_ajustado_original','usdbrl_fim_mes','preco_ajustado_usd','fonte'])
    for t in ORD:
        for m in sorted(k for k in usd[t] if k>=START_IPO):
            w.writerow([m,t,CUR[t],round(P[t][m],4),fx[m],round(usd[t][m],4),SRC[t][m]])
starts10={t:'2016-10' for t in ORD}
startsI={t:max(START_IPO,min(k for k in usd[t])) for t in ORD}
START_DIVO='2015-11'
startsD={t:max(START_DIVO,min(k for k in usd[t])) for t in ORD}
START_5='2021-10'; START_15='2011-10'
starts5={t:max(START_5,min(k for k in usd[t])) for t in ORD}
starts15={t:max(START_15,min(k for k in usd[t])) for t in ORD}
with open(O+'base100.csv','w',newline='') as f:
    w=csv.writer(f); w.writerow(['periodo','mes','ativo','moeda','indice'])
    for per,st in (('10a',starts10),('ipo',startsI),('divo',startsD),('5a',starts5),('15a',starts15)):
        for cur,S in (('USD',usd),('BRL',brl)):
            for t in ORD:
                b=S[t][st[t]]
                for m in months_from(st[t]): w.writerow([per,m,t,cur,round(100*S[t][m]/b,2)])
def stats(u,ms):
    rets=[u[m]/u[prv(m)]-1 for m in ms[1:]]
    vol=statistics.stdev(rets)*math.sqrt(12)
    peak=-1; mdd=0
    for m in ms:
        peak=max(peak,u[m]); mdd=min(mdd,u[m]/peak-1)
    return vol,mdd
R=[]
for t in ORD:
    u=usd[t]; b=brl[t]; ms=months_from('2016-10')
    r10=u[END]/u['2016-10']-1; vol,mdd=stats(u,ms); mb=b[END]/b['2016-10']
    R.append({'ativo':t,'nome':NOMES[t],'mercado':'Brasil' if CUR[t]=='BRL' else ('Desenvolvidos sem EUA' if t=='MXWOU' else ('Global' if t in ('VHYL','BTC') else 'EUA')),
      'ret_10a_usd':round(r10*100,1),'cagr_10a_usd':round(((1+r10)**0.1-1)*100,1),
      'ret_5a_usd':round((u[END]/u['2021-10']-1)*100,1),'ret_12m_usd':round((u[END]/u['2025-10']-1)*100,1),
      'ret_2026_usd':round((u[END]/u['2025-12']-1)*100,1),'ret_10a_brl':round((mb-1)*100,1),
      'vol_10a_usd':round(vol*100,1),'queda_max_usd':round(mdd*100,1),'multiplicador_10a_usd':round(1+r10,2),
      'cagr_10a_brl':round((mb**0.1-1)*100,1),'multiplicador_10a_brl':round(mb,2)})
with open(O+'retornos.csv','w',newline='') as f:
    w=csv.DictWriter(f,fieldnames=list(R[0])); w.writeheader(); w.writerows(R)
def longos(starts):
  RL=[]
  for t in ORD:
    st=starts[t]; ms=months_from(st); u=usd[t]; b=brl[t]
    yrs=(len(ms)-1)/12; mu=u[END]/u[st]; mb=b[END]/b[st]; vol,mdd=stats(u,ms)
    RL.append({'ativo':t,'nome':NOMES[t],'inicio':st,'anos':round(yrs,1),'multiplicador_usd':round(mu,1),
      'cagr_usd':round((mu**(1/yrs)-1)*100,1),'multiplicador_brl':round(mb,1),'cagr_brl':round((mb**(1/yrs)-1)*100,1),
      'vol_usd':round(vol*100,1),'queda_max_usd':round(mdd*100,1)})
  return RL
for fn,st in (('retornos_longo.csv',startsI),('retornos_divo.csv',startsD),('retornos_5a.csv',starts5),('retornos_15a.csv',starts15)):
  RL=longos(st)
  with open(O+fn,'w',newline='') as f:
    w=csv.DictWriter(f,fieldnames=list(RL[0])); w.writeheader(); w.writerows(RL)
RL=longos(startsI); RD=longos(startsD)
with open(O+'cambio.csv','w',newline='') as f:
    w=csv.writer(f); w.writerow(['periodo','inicio','fim','usdbrl_inicio','usdbrl_fim','alta_dolar_pct','perda_real_em_usd_pct'])
    for per,a in (('10a','2016-10'),('ipo',START_IPO),('divo',START_DIVO),('5a',START_5),('15a',START_15)):
        w.writerow([per,a,END,fx[a],fx[END],round((fx[END]/fx[a]-1)*100,1),round((fx[a]/fx[END]-1)*100,1)])
for r in sorted(R,key=lambda r:-r['ret_10a_usd']): print('10a',r['ativo'],r['multiplicador_10a_usd'],r['cagr_10a_usd'],r['multiplicador_10a_brl'],r['ret_5a_usd'],r['ret_12m_usd'],r['ret_2026_usd'],r['vol_10a_usd'],r['queda_max_usd'])
for r in sorted(RL,key=lambda r:-r['cagr_usd']): print('ipo',r)
for r in sorted(RD,key=lambda r:-r['cagr_usd']): print('divo',r['ativo'],r['inicio'],r['multiplicador_usd'],r['cagr_usd'],r['multiplicador_brl'],r['vol_usd'],r['queda_max_usd'])
for nm,stt in (('5a',starts5),('15a',starts15)):
  for r in sorted(longos(stt),key=lambda r:-r['cagr_usd']): print(nm,r['ativo'],r['inicio'],r['multiplicador_usd'],r['cagr_usd'],r['multiplicador_brl'],r['cagr_brl'],r['vol_usd'],r['queda_max_usd'])
print(open(O+'cambio.csv').read())

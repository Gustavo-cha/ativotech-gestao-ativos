'use client';

import { BarChart3, Download, Printer, DatabaseBackup, Wallet, Building2, Hourglass, ShieldCheck, PieChart, TrendingDown, Truck, Package, Gauge } from 'lucide-react';
import { PageHeader, Skeleton, ErroApi, Progress } from '@/components/ui';
import { Donut, HBars, Columns } from '@/components/charts';
import { useToast } from '@/components/providers';
import { useAuth } from '@/components/auth';
import { useApi } from '@/lib/hooks';
import { api } from '@/lib/api';
import { moeda, numero } from '@/lib/format';
import { GARANTIA, TOM_SOLICITACAO, STATUS_SOLICITACAO } from '@/lib/constants';

export default function Relatorios() {
  const { toast } = useToast();
  const { data: d, erro, recarregar } = useApi(() => api.dashboard(), []);

  const { pode } = useAuth();
  const baixar = (fn, nome) => { toast({ tipo: 'sucesso', titulo: `Exportando ${nome}…` }); fn().catch((e) => toast({ tipo: 'erro', titulo: 'Erro ao exportar', msg: e.message })); };

  return (
    <div className="page">
      <PageHeader icone={BarChart3} titulo="Relatórios" subtitulo="Solicitações, envios, itens mais pedidos e análise do parque de equipamentos.">
        <button type="button" className="btn" onClick={() => window.print()}><Printer size={16} /> Imprimir</button>
        {pode('sistema:admin') && <button type="button" className="btn" onClick={() => baixar(api.backup, 'backup JSON')}><DatabaseBackup size={16} /> Backup</button>}
        <button type="button" className="btn btn-primary" onClick={() => baixar(() => api.ativos.exportar(), 'inventário CSV')}><Download size={16} /> Inventário CSV</button>
      </PageHeader>
      <ErroApi erro={erro} onRetry={recarregar} />

      {!d ? <div className="report-grid">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} h={260} />)}</div> : (
        <>
          <div className="summary-band">
            <div><span>Ativos em operação</span><strong>{d.kpis.totalAtivos}</strong></div>
            <div><span>Valor de aquisição</span><strong>{moeda(d.kpis.valorAquisicao)}</strong></div>
            <div><span>Valor atual</span><strong>{moeda(d.kpis.valorAtual)}</strong></div>
            <div><span>Depreciação acumulada</span><strong className="txt-red">−{moeda(d.kpis.valorAquisicao - d.kpis.valorAtual)}</strong></div>
            <div><span>Descartados</span><strong>{d.kpis.descartados}</strong></div>
          </div>

          <div className="report-grid stagger">
            <section className="card span-2">
              <div className="card-head"><h2><TrendingDown size={17} /> Depreciação por categoria</h2></div>
              <div className="table-wrap">
                <table className="table compact">
                  <thead><tr><th>Categoria</th><th className="num">Qtd.</th><th className="num">Aquisição</th><th className="num">Valor atual</th><th>Valor residual</th></tr></thead>
                  <tbody>
                    {d.porCategoria.map((c) => {
                      const pct = (c.valorAtual / (c.valor || 1)) * 100;
                      return (
                        <tr key={c.nome}><td><strong>{c.nome}</strong></td><td className="num">{c.qtd}</td><td className="num">{moeda(c.valor)}</td><td className="num">{moeda(c.valorAtual)}</td>
                          <td className="w-bar"><div className="row-gap"><Progress valor={pct} tom={pct < 25 ? 'red' : pct < 50 ? 'amber' : 'green'} label={`Residual ${c.nome}`} /><span className="small muted">{Math.round(pct)}%</span></div></td></tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="card">
              <div className="card-head"><h2><ShieldCheck size={17} /> Situação das garantias</h2></div>
              <Donut subCentro="ativos" dados={Object.entries(d.garantia).map(([k, v]) => ({ label: GARANTIA[k].label, valor: v, cor: `var(--${GARANTIA[k].tom}-fg)` }))} />
            </section>

            <section className="card">
              <div className="card-head"><h2><Wallet size={17} /> Valor atual por categoria</h2></div>
              <HBars formato={(v) => moeda(v, true)} dados={[...d.porCategoria].sort((a, b) => b.valorAtual - a.valorAtual).map((c) => ({ label: c.nome, valor: c.valorAtual }))} />
            </section>

            <section className="card">
              <div className="card-head"><h2><Building2 size={17} /> Ativos por departamento</h2></div>
              <HBars dados={Object.entries(d.porDepartamento).sort((a, b) => b[1] - a[1]).map(([label, valor]) => ({ label, valor }))} cor="var(--accent)" />
            </section>

            <section className="card">
              <div className="card-head"><h2><Hourglass size={17} /> Idade do parque</h2></div>
              <Columns dados={Object.entries(d.idadeFaixas).map(([label, valor], i) => ({ label, valor, cor: ['var(--green-fg)', 'var(--cyan-fg)', 'var(--blue-fg)', 'var(--amber-fg)', 'var(--red-fg)'][i] }))} />
            </section>

            <section className="card">
              <div className="card-head"><h2><PieChart size={17} /> Solicitações por status</h2></div>
              <Donut subCentro="solicitações" dados={STATUS_SOLICITACAO.map((st) => ({ label: st, valor: d.solicitacoesPorStatus[st] || 0, cor: `var(--${TOM_SOLICITACAO[st]}-fg)` })).filter((x) => x.valor)} />
            </section>

            <section className="card">
              <div className="card-head"><h2><Package size={17} /> Itens mais pedidos</h2></div>
              {d.maisPedidos.length ? <HBars dados={d.maisPedidos} /> : <p className="muted small">Sem pedidos ainda.</p>}
            </section>

            <section className="card">
              <div className="card-head"><h2><Truck size={17} /> Envios por transportadora</h2></div>
              {d.porTransportadora.length ? <Columns dados={d.porTransportadora.map((x, i) => ({ ...x, cor: `var(--c${(i % 8) + 1})` }))} /> : <p className="muted small">Nenhum envio registrado.</p>}
            </section>

            <section className="card">
              <div className="card-head"><h2><Gauge size={17} /> Indicadores de atendimento</h2></div>
              <dl className="kv-list">
                <div><dt>Solicitações em andamento</dt><dd>{numero(d.kpis.solicitacoesAtivas)}</dd></div>
                <div><dt>Entregues no mês</dt><dd>{numero(d.kpis.entreguesMes)}</dd></div>
                <div><dt>Entregues até a admissão</dt><dd>{d.kpis.entregasNoPrazo}%</dd></div>
                <div><dt>Tempo médio de atendimento</dt><dd>{d.kpis.tempoMedioAtendimentoDias != null ? `${String(d.kpis.tempoMedioAtendimentoDias).replace('.', ',')} dias` : '—'}</dd></div>
                <div><dt>Entregas atrasadas agora</dt><dd>{d.kpis.entregasAtrasadas}</dd></div>
                <div><dt>Notebooks disponíveis / saldo da fila</dt><dd>{d.kpis.notebooksDisponiveis} / {d.kpis.notebooksSaldo}</dd></div>
                <div><dt>Acessórios abaixo do mínimo</dt><dd>{d.kpis.itensAbaixoMinimo}</dd></div>
                <div><dt>Taxa de uso do parque</dt><dd>{d.kpis.taxaUso}%</dd></div>
              </dl>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

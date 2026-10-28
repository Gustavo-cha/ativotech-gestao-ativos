'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Truck, Hammer, PackageCheck, AlarmClock, Gauge, Search, Store, MapPin, Copy, CalendarClock, ExternalLink, Package } from 'lucide-react';
import { PageHeader, Tabs, Skeleton, EmptyState, ErroApi, Badge } from '@/components/ui';
import { SolicitacaoBadge, UrgenciaBadge } from '@/components/portal/Status';
import { EnvioModal, EntregueModal } from '@/components/portal/SolicitacaoDetalhe';
import KpiCard from '@/components/KpiCard';
import { useToast, useUI } from '@/components/providers';
import { useApi } from '@/lib/hooks';
import { api } from '@/lib/api';
import { data as fmtData, dataHora, relativo, isoLocal } from '@/lib/format';

const ABAS = [
  { id: 'despachar', label: 'Prontos para despachar', filtro: (s) => s.status === 'Em preparação' && s.entrega.modalidade === 'envio' },
  { id: 'retirada', label: 'Retiradas na unidade', filtro: (s) => s.status === 'Em preparação' && s.entrega.modalidade === 'retirada' },
  { id: 'transito', label: 'Em trânsito', filtro: (s) => s.status === 'Enviado' },
  { id: 'entregues', label: 'Entregues', filtro: (s) => s.status === 'Entregue' }
];
const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Rastreio por transportadora (abre o site oficial com o código, quando houver)
const linkRastreio = (env) => {
  const c = encodeURIComponent(env?.codigoRastreio || '');
  if (!c) return null;
  if (/Correios/.test(env.transportadora)) return `https://rastreamento.correios.com.br/app/index.php?objeto=${c}`;
  if (env.transportadora === 'Jadlog') return `https://www.jadlog.com.br/jadlog/tracking?cte=${c}`;
  return null;
};

function Envios() {
  const params = useSearchParams();
  const { toast } = useToast();
  const ui = useUI();
  const [aba, setAba] = useState(ABAS.some((a) => a.id === params.get('aba')) ? params.get('aba') : 'despachar');
  const [q, setQ] = useState('');
  const [janela, setJanela] = useState(null); // { tipo: 'envio'|'entregue', s }
  useEffect(() => { const a = params.get('aba'); if (ABAS.some((x) => x.id === a)) setAba(a); }, [params]);
  const [ocupado, setOcupado] = useState(false);
  const { data, erro, carregando, recarregar } = useApi(() => api.solicitacoes.listar(), []);
  const { data: painel } = useApi(() => api.dashboard(), []);

  const base = useMemo(() => (data || []).filter((s) => ['Em preparação', 'Enviado', 'Entregue'].includes(s.status)), [data]);
  const lista = useMemo(() => {
    const t = norm(q);
    let l = base.filter(ABAS.find((a) => a.id === aba).filtro)
      .filter((s) => !t || norm(`${s.numero} ${s.nomeAdmitido} ${s.enderecoResumo} ${s.envio?.transportadora} ${s.envio?.codigoRastreio} ${s.itensResumo}`).includes(t));
    if (aba === 'entregues') l = l.sort((a, b) => (b.envio?.entregueEm || '').localeCompare(a.envio?.entregueEm || '')).slice(0, 40);
    else if (aba === 'transito') l = l.sort((a, b) => (a.previsaoEntrega || '9').localeCompare(b.previsaoEntrega || '9'));
    else l = l.sort((a, b) => a.dataAdmissao.localeCompare(b.dataAdmissao));
    return l;
  }, [base, aba, q]);
  const k = painel?.kpis;

  async function mudar(s, status, extras, msg) {
    setOcupado(true);
    try {
      await api.solicitacoes.status(s.id, status, extras);
      toast({ tipo: 'sucesso', titulo: msg });
      setJanela(null);
    } catch (e) {
      toast({ tipo: 'erro', titulo: 'Não foi possível concluir', msg: e.message });
    } finally {
      setOcupado(false);
    }
  }
  const copiar = (c) => navigator.clipboard?.writeText(c).then(() => toast({ tipo: 'sucesso', titulo: 'Código copiado' })).catch(() => {});

  return (
    <div className="page">
      <PageHeader icone={Truck} titulo="Envios" subtitulo="Despache o que está preparado, acompanhe o transporte e confirme as entregas." />
      <ErroApi erro={erro} onRetry={recarregar} />

      <div className="kpi-grid">
        <KpiCard icone={Hammer} tom="orange" titulo="Prontos para despachar" valor={data ? base.filter(ABAS[0].filtro).length : null} sub={`${data ? base.filter(ABAS[1].filtro).length : 0} retirada(s) na unidade`} />
        <KpiCard icone={Truck} tom="cyan" titulo="Em trânsito" valor={k?.emTransito} sub="Aguardando confirmação de entrega" />
        <KpiCard icone={AlarmClock} tom="red" titulo="Entregas atrasadas" valor={k?.entregasAtrasadas} sub="Previsão já passou" destaque={k?.entregasAtrasadas > 0} />
        <KpiCard icone={PackageCheck} tom="green" titulo="Entregues no mês" valor={k?.entreguesMes} sub={k?.tempoMedioAtendimentoDias != null ? `Tempo médio: ${String(k.tempoMedioAtendimentoDias).replace('.', ',')} dias` : 'Desde a abertura'} />
        <KpiCard icone={Gauge} tom="violet" titulo="Entregues até a admissão" valor={k?.entregasNoPrazo} formato={(v) => `${Math.round(v)}%`} sub="Pontualidade das entregas" />
      </div>

      <div className="card no-pad">
        <Tabs ativa={aba} onChange={setAba} className="tabs-card" abas={ABAS.map((a) => ({ id: a.id, label: a.label, qtd: base.filter(a.filtro).length }))} />
        <div className="toolbar">
          <div className="search-input"><Search size={16} /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por SOL-, colaborador, cidade, transportadora ou código de rastreio…" aria-label="Buscar envios" /></div>
        </div>
        {carregando ? <div className="pad"><Skeleton h={90} /><Skeleton h={90} style={{ marginTop: 10 }} /></div>
          : lista.length === 0 ? (
            <EmptyState icon={aba === 'transito' ? Truck : Package} titulo={q ? 'Nada encontrado' : aba === 'despachar' ? 'Nada aguardando despacho' : aba === 'transito' ? 'Nenhum envio em trânsito' : aba === 'retirada' ? 'Nenhuma retirada pendente' : 'Nenhuma entrega registrada'}
              texto={aba === 'despachar' && !q ? 'Quando uma solicitação estiver “Em preparação” com todos os itens reservados, ela aparece aqui.' : undefined} />
          ) : (
            <ul className="envio-list">
              {lista.map((s) => {
                const link = linkRastreio(s.envio);
                return (
                  <li key={s.id} className={`envio-row ${s.entregaAtrasada ? 'atrasada' : ''} ${s.urgencia === 'critica' && s.status === 'Em preparação' ? 'urgente' : ''}`}>
                    <div className="envio-main">
                      <div className="badge-row">
                        <Link href={`/solicitacoes/${s.id}`} className="mono small">{s.numero}</Link>
                        <SolicitacaoBadge status={s.status} />
                        {s.status === 'Em preparação' && <UrgenciaBadge s={s} />}
                        {s.entregaAtrasada && <Badge tom="red"><AlarmClock size={11} /> Atrasada</Badge>}
                      </div>
                      <strong className="envio-nome">{s.nomeAdmitido}</strong>
                      <small className="muted">{s.itensResumo}</small>
                    </div>
                    <div className="envio-destino small">
                      {s.entrega.modalidade === 'retirada'
                        ? <span><Store size={14} /> {s.entrega.unidade}</span>
                        : <span><MapPin size={14} /> {s.enderecoResumo}</span>}
                      <span className="muted"><CalendarClock size={13} /> Admissão {fmtData(s.dataAdmissao)}</span>
                    </div>
                    <div className="envio-transp small">
                      {s.envio?.transportadora ? (
                        <>
                          <strong>{s.envio.transportadora}</strong>
                          {s.envio.codigoRastreio && (
                            <span className="rastreio-inline">
                              <span className="mono">{s.envio.codigoRastreio}</span>
                              <button type="button" className="icon-btn ghost sm" onClick={() => copiar(s.envio.codigoRastreio)} aria-label="Copiar código"><Copy size={13} /></button>
                              {link && <a href={link} target="_blank" rel="noreferrer noopener" className="icon-btn ghost sm" aria-label="Rastrear no site da transportadora"><ExternalLink size={13} /></a>}
                            </span>
                          )}
                          <span className="muted">
                            {s.status === 'Entregue' ? `Entregue ${dataHora(s.envio.entregueEm)} · ${s.envio.recebidoPor}` : `Enviado ${fmtData(s.envio.dataEnvio)}${s.previsaoEntrega ? ` · previsão ${fmtData(s.previsaoEntrega)}` : ''}`}
                          </span>
                        </>
                      ) : s.status === 'Entregue' ? (
                        <span className="muted">Retirado {relativo(s.envio?.entregueEm)} · {s.envio?.recebidoPor}</span>
                      ) : <span className="muted">{s.previsaoEntrega ? `Previsão ${fmtData(s.previsaoEntrega)}` : 'Sem previsão definida'}</span>}
                    </div>
                    <div className="envio-acoes">
                      {s.status === 'Em preparação' && s.entrega.modalidade === 'envio' && <button type="button" className="btn btn-sm btn-primary" onClick={() => setJanela({ tipo: 'envio', s })}><Truck size={14} /> Registrar envio</button>}
                      {s.status === 'Em preparação' && s.entrega.modalidade === 'retirada' && <button type="button" className="btn btn-sm btn-primary" onClick={() => setJanela({ tipo: 'entregue', s })}><PackageCheck size={14} /> Confirmar retirada</button>}
                      {s.status === 'Enviado' && <button type="button" className="btn btn-sm btn-primary" onClick={() => setJanela({ tipo: 'entregue', s })}><PackageCheck size={14} /> Confirmar entrega</button>}
                      <Link href={`/solicitacoes/${s.id}`} className="btn btn-sm btn-ghost">Detalhes</Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
      </div>

      {janela?.tipo === 'envio' && (
        <EnvioModal s={janela.s} aberto fechar={() => setJanela(null)} ocupado={ocupado}
          confirmar={(env) => mudar(janela.s, 'Enviado', { envio: env }, `${janela.s.numero} despachada por ${env.transportadora}`)} />
      )}
      {janela?.tipo === 'entregue' && (
        <EntregueModal s={janela.s} aberto fechar={() => setJanela(null)} ocupado={ocupado}
          confirmar={(recebidoPor) => mudar(janela.s, 'Entregue', { recebidoPor }, `${janela.s.numero} entregue`)} />
      )}
      <p className="muted small mt-12">Hoje: {fmtData(isoLocal())}. Equipamentos enviados aparecem como “Enviado” no estoque até a confirmação da entrega.</p>
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<div className="page"><Skeleton h={400} /></div>}><Envios /></Suspense>;
}

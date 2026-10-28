'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Inbox, Search, FilePlus2, AlertOctagon, Hourglass, Hammer, SlidersHorizontal, FilterX, Warehouse, Sparkles, Truck, Store, PackageCheck } from 'lucide-react';
import { PageHeader, Tabs, Skeleton, EmptyState, ErroApi, Progress, Segmented } from '@/components/ui';
import { SolicitacaoBadge, UrgenciaBadge, NovaBadge } from '@/components/portal/Status';
import { useApi } from '@/lib/hooks';
import { api } from '@/lib/api';
import { data as fmtData, relativo } from '@/lib/format';
import { TIPOS_SOLICITACAO } from '@/lib/constants';

const FINAIS = ['Entregue', 'Cancelado'];
const ABAS = [
  { id: 'fila', label: 'Fila ativa', filtro: (s) => !FINAIS.includes(s.status) },
  { id: 'novas', label: 'Novas', filtro: (s) => s.nova },
  { id: 'pendentes', label: 'Pendentes / análise', filtro: (s) => ['Pendente', 'Em análise'].includes(s.status) },
  { id: 'aguardando', label: 'Aguardando estoque', filtro: (s) => s.status === 'Aguardando estoque' },
  { id: 'preparacao', label: 'Em preparação', filtro: (s) => s.status === 'Em preparação' },
  { id: 'enviadas', label: 'Enviadas', filtro: (s) => s.status === 'Enviado' },
  { id: 'entregues', label: 'Entregues', filtro: (s) => s.status === 'Entregue' },
  { id: 'canceladas', label: 'Canceladas', filtro: (s) => s.status === 'Cancelado' }
];
const FINAIS_ABAS = ['entregues', 'canceladas'];
const PROPRIETARIOS = ['H&CO', 'H&CO B2Finance'];
const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Fila central da TI: tudo o que o RH abre aparece aqui na hora, destacado como "nova"
function PainelSolicitacoes() {
  const router = useRouter();
  const params = useSearchParams();
  const [aba, setAba] = useState(ABAS.some((a) => a.id === params.get('filtro')) ? params.get('filtro') : 'fila');
  const [q, setQ] = useState('');
  const [tipo, setTipo] = useState('');
  const [dep, setDep] = useState('');
  const [filtros, setFiltros] = useState(false);
  const [dono, setDono] = useState('');
  const [chegaram, setChegaram] = useState([]);
  useEffect(() => { const f = params.get('filtro'); if (ABAS.some((a) => a.id === f)) setAba(f); }, [params]);
  // Histórico (entregues e canceladas) só é carregado quando uma dessas abas é aberta
  const historico = FINAIS_ABAS.includes(aba);
  const { data, erro, carregando, recarregar } = useApi(() => api.solicitacoes.listar({ ...(historico ? {} : { status: 'ativas' }), proprietario: dono }), [historico, dono]);

  // Destaque animado para o que acabou de chegar pelo canal em tempo real
  useEffect(() => {
    const h = (e) => {
      setChegaram((x) => [...x, e.detail.id]);
      setTimeout(() => setChegaram((x) => x.filter((id) => id !== e.detail.id)), 9000);
    };
    window.addEventListener('ativotech:solicitacao:nova', h);
    return () => window.removeEventListener('ativotech:solicitacao:nova', h);
  }, []);

  const base = data || [];
  const ativas = base.filter(ABAS[0].filtro);
  const deps = [...new Set(base.map((s) => s.departamento))].sort();
  const lista = useMemo(() => {
    const t = norm(q);
    return base.filter(ABAS.find((a) => a.id === aba).filtro)
      .filter((s) => (!tipo || s.tipo === tipo) && (!dep || s.departamento === dep))
      .filter((s) => !t || norm(`${s.numero} ${s.nomeAdmitido} ${s.cargo} ${s.departamento} ${s.solicitanteNome} ${s.itensResumo} ${s.enderecoResumo} ${s.envio?.codigoRastreio || ''} ${s.itens.flatMap((l) => (l.equipamentos || []).map((e) => e.patrimonio)).join(' ')}`).includes(t));
  }, [base, aba, q, tipo, dep]);

  const urgentesSemReserva = ativas.filter((s) => !s.progressoReserva.completo && s.diasParaAdmissao <= 7 && !['Enviado'].includes(s.status));
  const contagem = (a) => (FINAIS_ABAS.includes(a.id) && !historico ? undefined : base.filter(a.filtro).length);

  return (
    <div className="page">
      <PageHeader icone={Inbox} titulo="Solicitações" subtitulo="Pedidos do RH: analise, reserve, prepare e despache.">
        <Link href="/envios" className="btn"><Truck size={16} /> <span className="hide-sm">Envios</span></Link>
        <Link href="/portal/nova" className="btn btn-primary"><FilePlus2 size={16} /> Nova</Link>
      </PageHeader>
      <ErroApi erro={erro} onRetry={recarregar} />

      {urgentesSemReserva.length > 0 && (
        <button type="button" className="inline-warn warn-btn" onClick={() => setAba('pendentes')}>
          <AlertOctagon size={15} /> {urgentesSemReserva.length} admissão(ões) em até 7 dias ainda sem reserva completa.
        </button>
      )}

      <div className="card no-pad">
        <Tabs ativa={aba} onChange={setAba} className="tabs-card" abas={ABAS.map((a) => ({ id: a.id, label: a.label, qtd: contagem(a) }))} />
        <div className="toolbar">
          <Segmented label="Proprietário" valor={dono} onChange={setDono} opcoes={[{ id: '', label: 'Todos' }, ...PROPRIETARIOS.map((p) => ({ id: p, label: p }))]} />
          <div className="search-input"><Search size={16} /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por SOL-, colaborador, item, cidade, patrimônio ou rastreio…" aria-label="Buscar solicitações" /></div>
          <button type="button" className={`btn ${filtros || tipo || dep ? 'btn-soft' : ''}`} onClick={() => setFiltros((v) => !v)} aria-expanded={filtros}><SlidersHorizontal size={16} /> Filtros</button>
        </div>
        {filtros && (
          <div className="filter-row">
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo"><option value="">Todos os tipos</option>{TIPOS_SOLICITACAO.map((t) => <option key={t}>{t}</option>)}</select>
            <select value={dep} onChange={(e) => setDep(e.target.value)} aria-label="Departamento"><option value="">Todos os departamentos</option>{deps.map((d) => <option key={d}>{d}</option>)}</select>
            {(tipo || dep) && <button type="button" className="btn btn-ghost" onClick={() => { setTipo(''); setDep(''); }}><FilterX size={16} /> Limpar</button>}
          </div>
        )}

        {carregando ? <div className="pad"><Skeleton h={48} /><Skeleton h={48} style={{ marginTop: 8 }} /><Skeleton h={48} style={{ marginTop: 8 }} /></div>
          : lista.length === 0 ? <EmptyState icon={Inbox} titulo={aba === 'novas' ? 'Nenhuma solicitação nova' : aba === 'fila' && !q ? 'Fila zerada' : 'Nenhuma solicitação encontrada'} texto={aba === 'novas' ? 'Quando o RH enviar um pedido, ele aparece aqui na hora.' : undefined} />
            : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Nº</th><th>Colaborador</th><th>Itens</th><th>Admissão</th><th>Status</th><th>Reserva</th><th>Destino</th></tr></thead>
                  <tbody>
                    {lista.map((s) => {
                      const p = s.progressoReserva;
                      return (
                        <tr key={s.id} tabIndex={0} onClick={() => router.push(`/solicitacoes/${s.id}`)} onKeyDown={(e) => e.key === 'Enter' && router.push(`/solicitacoes/${s.id}`)}
                          className={`prio-row ${s.urgencia === 'critica' ? 'prio-red' : s.urgencia === 'alta' ? 'prio-orange' : ''} ${s.nova ? 'row-nova' : ''} ${chegaram.includes(s.id) ? 'row-chegou' : ''}`}>
                          <td className="mono muted nowrap">{s.numero}</td>
                          <td><div className="cell-stack"><span className="row-title-line"><strong className="row-title">{s.nomeAdmitido}</strong>{s.nova && <NovaBadge />}</span><small className="muted">{s.cargo} · {s.departamento} · por {s.solicitanteNome}, {relativo(s.criadoEm)}</small></div></td>
                          <td className="cell-itens"><span title={s.itensResumo}>{s.itensResumo}</span><small className={`owner-tag ${s.proprietario === 'H&CO B2Finance' ? 'b2f' : ''}`}>{s.proprietario === 'H&CO B2Finance' ? 'B2Finance' : 'H&CO'}</small></td>
                          <td><div className="cell-stack"><span>{fmtData(s.dataAdmissao)}</span><UrgenciaBadge s={s} /></div></td>
                          <td><SolicitacaoBadge status={s.status} rejeitada={s.rejeitada} /></td>
                          <td className="cell-reserva">{FINAIS.includes(s.status) || s.status === 'Enviado' ? <span className="muted">—</span> : (
                            <div className="cell-stack"><Progress valor={p.total ? (p.alocado / p.total) * 100 : 0} tom={p.completo ? 'green' : p.alocado ? 'amber' : 'slate'} label="Reserva" /><small className={p.completo ? 'txt-green' : 'muted'}>{p.alocado}/{p.total}{p.completo ? ' · completo' : ''}</small></div>
                          )}</td>
                          <td><span className="cell-person">{s.entrega.modalidade === 'retirada' ? <Store size={14} /> : <Truck size={14} />}<span className="truncate">{s.entrega.modalidade === 'retirada' ? 'Retirada' : `${s.entrega.cidade}/${s.entrega.uf}`}</span></span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
      </div>
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<div className="page"><Skeleton h={400} /></div>}><PainelSolicitacoes /></Suspense>;
}

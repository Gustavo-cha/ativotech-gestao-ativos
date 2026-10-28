'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ClipboardList, FilePlus2, Search, CalendarClock, Package, Truck } from 'lucide-react';
import { PageHeader, Tabs, Skeleton, EmptyState, ErroApi } from '@/components/ui';
import { SolicitacaoBadge, UrgenciaBadge, EtapasSolicitacao } from '@/components/portal/Status';
import { useAuth } from '@/components/auth';
import { useApi } from '@/lib/hooks';
import { useVistos, naoLida } from '@/lib/portal';
import { api } from '@/lib/api';
import { data as fmtData, relativo } from '@/lib/format';

const ABAS = [
  { id: 'andamento', label: 'Em andamento', filtro: (s) => !['Entregue', 'Cancelado'].includes(s.status) },
  { id: 'enviadas', label: 'A caminho', filtro: (s) => s.status === 'Enviado' },
  { id: 'entregues', label: 'Entregues', filtro: (s) => s.status === 'Entregue' },
  { id: 'canceladas', label: 'Canceladas', filtro: (s) => s.status === 'Cancelado' },
  { id: 'todas', label: 'Todas', filtro: () => true }
];

export default function MinhasSolicitacoes() {
  const { usuario } = useAuth();
  const [vistos] = useVistos();
  const [aba, setAba] = useState('andamento');
  const [q, setQ] = useState('');
  const { data, erro, carregando, recarregar } = useApi(() => api.solicitacoes.listar({ minhas: 1 }), []);

  const base = data || [];
  const filtrados = useMemo(() => {
    const t = q.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    return base.filter(ABAS.find((a) => a.id === aba).filtro)
      .filter((s) => !t || `${s.numero} ${s.nomeAdmitido} ${s.cargo} ${s.departamento} ${s.itensResumo} ${s.envio?.codigoRastreio || ''}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(t));
  }, [base, aba, q]);

  return (
    <div className="page">
      <PageHeader icone={ClipboardList} titulo="Minhas solicitações" subtitulo="Acompanhe o status, o envio, o rastreio e as mensagens da TI — tudo atualizado em tempo real.">
        <Link href="/portal/nova" className="btn btn-primary"><FilePlus2 size={16} /> Nova solicitação</Link>
      </PageHeader>
      <ErroApi erro={erro} onRetry={recarregar} />

      <div className="card no-pad">
        <Tabs ativa={aba} onChange={setAba} className="tabs-card" abas={ABAS.map((a) => ({ id: a.id, label: a.label, qtd: base.filter(a.filtro).length }))} />
        <div className="toolbar">
          <div className="search-input"><Search size={16} /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, número (SOL-…), item ou código de rastreio…" aria-label="Buscar solicitações" /></div>
        </div>
        {carregando ? <div className="pad"><Skeleton h={90} /><Skeleton h={90} style={{ marginTop: 10 }} /></div>
          : filtrados.length === 0 ? (
            <EmptyState icon={ClipboardList} titulo={q ? 'Nada encontrado' : aba === 'andamento' ? 'Nenhuma solicitação em andamento' : 'Nada por aqui'}
              texto={aba === 'andamento' && !q ? 'Abra uma solicitação quando houver uma nova admissão.' : undefined}>
              {aba === 'andamento' && !q && <Link href="/portal/nova" className="btn btn-primary"><FilePlus2 size={16} /> Nova solicitação</Link>}
            </EmptyState>
          ) : (
            <ul className="req-list">
              {filtrados.map((s) => {
                const novo = naoLida(s, usuario, vistos);
                return (
                  <li key={s.id}>
                    <Link href={`/portal/solicitacoes/${s.id}`} className={`req-row ${novo ? 'unread' : ''}`}>
                      <div className="req-row-main">
                        <div className="badge-row">
                          <span className="mono muted small">{s.numero}</span>
                          <SolicitacaoBadge status={s.status} rejeitada={s.rejeitada} />
                          <UrgenciaBadge s={s} />
                          {novo && <span className="new-dot">Novidade</span>}
                        </div>
                        <strong className="req-name">{s.nomeAdmitido}</strong>
                        <small className="muted">{s.cargo} · {s.departamento} · {s.tipo}</small>
                      </div>
                      <div className="req-row-steps"><EtapasSolicitacao s={s} compacto /></div>
                      <div className="req-row-info small">
                        <span><CalendarClock size={13} /> Admissão {fmtData(s.dataAdmissao)}</span>
                        <span><Package size={13} /> {s.itensResumo}</span>
                        {s.envio?.transportadora && s.status === 'Enviado'
                          ? <span><Truck size={13} /> {s.envio.transportadora}{s.envio.codigoRastreio ? ` · ${s.envio.codigoRastreio}` : ''}</span>
                          : <span className="muted">{s.previsaoEntrega ? `Previsão ${fmtData(s.previsaoEntrega)}` : `Atualizada ${relativo(s.atualizadoEm)}`}</span>}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
      </div>
    </div>
  );
}

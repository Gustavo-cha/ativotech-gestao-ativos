'use client';

import Link from 'next/link';
import { FilePlus2, ArrowRight, ClipboardList, PackageSearch, CalendarClock, Sparkles, Truck, Package } from 'lucide-react';
import { EstoquePorProprietario } from '@/components/portal/Estoque';
import { SolicitacaoBadge, UrgenciaBadge, EtapasSolicitacao } from '@/components/portal/Status';
import { Skeleton, EmptyState, ErroApi } from '@/components/ui';
import { useAuth } from '@/components/auth';
import { useApi } from '@/lib/hooks';
import { useVistos, naoLida, ultimaNovidade } from '@/lib/portal';
import { api } from '@/lib/api';
import { saudacao, data as fmtData, relativo } from '@/lib/format';

export default function InicioPortal() {
  const { usuario } = useAuth();
  const [vistos] = useVistos();
  const { data: estoque, erro } = useApi(() => api.estoque.resumo(), []);
  const { data: minhas } = useApi(() => api.solicitacoes.listar({ minhas: 1 }), []);
  const ativas = (minhas || []).filter((s) => !['Entregue', 'Cancelado'].includes(s.status));
  const concluidas = (minhas || []).filter((s) => s.status === 'Entregue').length;

  return (
    <div className="page">
      <section className="hero portal-hero">
        <div>
          <h1>{saudacao()}, {usuario.nome.split(' ')[0]}</h1>
          <p className="hero-sub">{minhas ? <>Você tem <strong>{ativas.length} solicitaç{ativas.length === 1 ? 'ão' : 'ões'} em andamento</strong>{concluidas ? <> e {concluidas} entregue{concluidas === 1 ? '' : 's'}</> : ''}.</> : <Skeleton h={18} w={300} />}</p>
        </div>
        <div className="hero-actions">
          <Link href="/portal/nova" className="btn btn-primary"><FilePlus2 size={17} /> Solicitar equipamentos</Link>
        </div>
      </section>

      <ErroApi erro={erro} />

      <section>
        <div className="section-bar"><h2 className="sub-title"><PackageSearch size={16} /> Disponível agora</h2><Link href="/portal/estoque" className="link-more">Ver estoque <ArrowRight size={14} /></Link></div>
        <EstoquePorProprietario r={estoque} />
      </section>

      <section className="card">
        <div className="card-head">
          <h2><ClipboardList size={17} /> Suas solicitações em andamento</h2>
          <Link href="/portal/solicitacoes" className="link-more">Ver todas <ArrowRight size={14} /></Link>
        </div>
        {!minhas ? <Skeleton h={160} /> : ativas.length === 0 ? (
          <EmptyState icon={Sparkles} titulo="Nenhuma solicitação em andamento" texto="Quando houver uma nova admissão, peça o notebook por aqui com antecedência.">
            <Link href="/portal/nova" className="btn btn-primary"><FilePlus2 size={16} /> Nova solicitação</Link>
          </EmptyState>
        ) : (
          <div className="req-cards">
            {ativas.map((s) => {
              const novo = naoLida(s, usuario, vistos);
              const n = ultimaNovidade(s, usuario);
              return (
                <Link key={s.id} href={`/portal/solicitacoes/${s.id}`} className={`req-card ${novo ? 'unread' : ''}`}>
                  <div className="req-card-top">
                    <span className="mono muted small">{s.numero}</span>
                    {novo && <span className="new-dot">Novidade</span>}
                    <SolicitacaoBadge status={s.status} />
                  </div>
                  <strong className="req-name">{s.nomeAdmitido}</strong>
                  <small className="muted">{s.cargo} · {s.departamento}</small>
                  <small className="req-itens">{s.itensResumo}</small>
                  <EtapasSolicitacao s={s} compacto />
                  <div className="req-card-foot">
                    <span className="small"><CalendarClock size={13} /> Admissão {fmtData(s.dataAdmissao)}</span>
                    <UrgenciaBadge s={s} />
                  </div>
                  {n && <p className="req-last small muted">“{n.texto}” — {n.autor}, {relativo(n.em)}</p>}
                  {s.status === 'Enviado' && s.envio?.transportadora && <p className="small req-track"><Truck size={13} /> {s.envio.transportadora}{s.envio.codigoRastreio ? <> · <span className="mono">{s.envio.codigoRastreio}</span></> : ''}</p>}
                  {s.previsaoEntrega && <p className="small"><strong>Previsão de entrega:</strong> {fmtData(s.previsaoEntrega)}</p>}
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

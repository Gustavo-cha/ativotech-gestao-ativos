'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BellRing, CalendarDays, ArrowRight, Activity, Gauge, Inbox, Truck, Hammer, PackagePlus, AlarmClock, Store, MapPin, ChevronDown, Building2 } from 'lucide-react';
import { AreaChart, Donut, Ring, HBars } from '@/components/charts';
import { Skeleton, ErroApi, Badge, EmptyState } from '@/components/ui';
import { AtividadeItem } from '@/components/AtividadeItem';
import { useUI, useToast } from '@/components/providers';
import { useAuth } from '@/components/auth';
import { SolicitacaoBadge, NovaBadge } from '@/components/portal/Status';
import AvisoEmail from '@/components/AvisoEmail';
import { irParaAlerta } from '@/components/shell/Topbar';
import { useApi, useLocalState } from '@/lib/hooks';
import { api } from '@/lib/api';
import { saudacao, isoLocal, parseISO, DIAS_CURTOS, MESES, relativo } from '@/lib/format';
import { TOM_EVENTO, TOM_SEVERIDADE, TOM_SOLICITACAO, STATUS_SOLICITACAO } from '@/lib/constants';

const curta = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const diasTxt = (d) => (d < 0 ? `há ${-d}d` : d === 0 ? 'hoje' : d === 1 ? 'amanhã' : `em ${d}d`);

// Painel do Operador: o que precisa de ação agora em primeiro plano; indicadores e gráficos ficam em "Mais indicadores"
export default function Painel() {
  const router = useRouter();
  const { usuario } = useAuth();
  const [mais, setMais] = useLocalState('ativotech:painel-mais', false);
  const { data: d, erro, recarregar } = useApi(() => api.dashboard(), []);

  if (erro) return <ErroApi erro={erro} onRetry={recarregar} />;
  const k = d?.kpis;
  const estoque = k?.estoquePorProprietario || [];
  const stats = k ? [
    { label: 'Novas', valor: k.solicitacoesNovas, href: '/solicitacoes?filtro=novas', tom: k.solicitacoesNovas ? 'blue' : '', sub: `${k.solicitacoesPendentes} em análise` },
    { label: 'Em preparação', valor: k.emPreparacao, href: '/envios', sub: `${k.aguardandoEstoque} aguardando estoque` },
    { label: 'Em trânsito', valor: k.emTransito, href: '/envios?aba=transito', tom: k.entregasAtrasadas ? 'red' : '', sub: k.entregasAtrasadas ? `${k.entregasAtrasadas} atrasada(s)` : 'nenhuma atrasada' },
    ...estoque.map((p) => ({ label: `Notebooks · ${p.proprietario === 'H&CO B2Finance' ? 'B2Finance' : 'H&CO'}`, valor: p.notebooksDisponiveis, href: '/estoque', tom: p.saldoProjetado < 0 ? 'red' : '', sub: p.saldoProjetado < 0 ? `faltam ${-p.saldoProjetado} para a fila` : `${p.equipamentosDisponiveis} equipamento(s) livres` }))
  ] : [];

  return (
    <div className="page">
      <section className="hero">
        <div>
          <h1>{saudacao()}, {usuario.nome.split(' ')[0]}</h1>
          {k ? (
            <p className="hero-sub">
              {k.solicitacoesNovas ? <Link href="/solicitacoes?filtro=novas"><strong className="txt-accent">{k.solicitacoesNovas} nova{k.solicitacoesNovas === 1 ? '' : 's'}</strong></Link> : 'Nenhuma solicitação nova'}
              {' · '}{k.admissoes7dias} admiss{k.admissoes7dias === 1 ? 'ão' : 'ões'} nos próximos 7 dias
            </p>
          ) : <Skeleton h={18} w={320} />}
        </div>
        <div className="hero-actions">
          <Link href="/solicitacoes" className="btn btn-primary"><Inbox size={16} /> Fila</Link>
          <Link href="/estoque?aba=itens&acao=entrada" className="btn"><PackagePlus size={16} /> Entrada</Link>
        </div>
      </section>

      <AvisoEmail />

      <section className="stat-strip stat-links" aria-label="Indicadores principais">
        {!k ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} h={70} r={12} />) : stats.map((s) => (
          <Link key={s.label} href={s.href} className={`stat ${s.tom ? `tone-${s.tom} stat-alert` : ''}`}>
            <span className="stat-label">{s.label}</span>
            <strong>{s.valor}</strong>
            <small>{s.sub}</small>
          </Link>
        ))}
      </section>

      <section className="grid-3">
        <div className="card span-2">
          <div className="card-head"><h2><Inbox size={17} /> Fila de entrada</h2>
            <Link href="/solicitacoes" className="link-more">Todas <ArrowRight size={14} /></Link></div>
          {!d ? <Skeleton h={200} /> : d.novasSolicitacoes.length === 0 ? <EmptyState icon={Inbox} titulo="Fila vazia" texto="Novos pedidos do RH aparecem aqui na hora." /> : (
            <ul className="mini-list">
              {d.novasSolicitacoes.map((s) => (
                <li key={s.id}>
                  <Link href={`/solicitacoes/${s.id}`} className={`mini-item ${s.nova ? 'is-nova' : ''}`}>
                    <span className="mono muted">{s.numero}</span>
                    <span className="mini-title">
                      <span className="row-title-line">{s.nomeAdmitido}{s.nova && <NovaBadge />}</span>
                      <small>{s.itensResumo} · {s.modalidade === 'retirada' ? 'retirada' : s.destino.split(' · ').at(-2) || s.destino} · {relativo(s.criadoEm)}</small>
                    </span>
                    <span className="mini-badges"><SolicitacaoBadge status={s.status} /><Badge tom={s.diasParaAdmissao <= 3 ? 'red' : s.diasParaAdmissao <= 7 ? 'orange' : 'slate'}>{diasTxt(s.diasParaAdmissao)}</Badge></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card">
          <div className="card-head"><h2><BellRing size={17} /> Precisa de atenção</h2>
            <Link href="/alertas" className="link-more">Alertas <ArrowRight size={14} /></Link></div>
          {!d ? <Skeleton h={200} /> : d.alertasTop.length === 0 ? <EmptyState titulo="Tudo em dia" /> : (
            <ul className="alert-mini">
              {d.alertasTop.slice(0, 4).map((a) => (
                <li key={a.id}>
                  <button type="button" className="alert-mini-btn" onClick={() => irParaAlerta(a, router)}>
                    <i className={`sev sev-${TOM_SEVERIDADE[a.severidade]}`} aria-hidden="true" />
                    <span><strong>{a.titulo}</strong><small>{a.descricao}</small></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="grid-2">
        <div className="card">
          <div className="card-head"><h2><Hammer size={17} /> Para despachar</h2><Link href="/envios" className="link-more">Envios <ArrowRight size={14} /></Link></div>
          {!d ? <Skeleton h={150} /> : d.emPreparacao.length === 0 ? <EmptyState titulo="Nada em preparação" /> : (
            <ul className="mini-list">
              {d.emPreparacao.map((s) => (
                <li key={s.id}>
                  <Link href={`/solicitacoes/${s.id}`} className="mini-item">
                    <span className="mini-icon">{s.modalidade === 'retirada' ? <Store size={15} /> : <MapPin size={15} />}</span>
                    <span className="mini-title">{s.nomeAdmitido}<small>{s.itensResumo}</small></span>
                    <span className="mini-badges"><Badge tom={s.diasParaAdmissao <= 2 ? 'red' : 'slate'}>{curta(s.dataAdmissao)}</Badge></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card">
          <div className="card-head"><h2><Truck size={17} /> Em trânsito</h2><Link href="/envios?aba=transito" className="link-more">Rastrear <ArrowRight size={14} /></Link></div>
          {!d ? <Skeleton h={150} /> : d.enviosEmTransito.length === 0 ? <EmptyState titulo="Nenhum envio a caminho" /> : (
            <ul className="mini-list">
              {d.enviosEmTransito.map((s) => {
                const atrasado = s.previsaoEntrega && s.previsaoEntrega < isoLocal();
                return (
                  <li key={s.id}>
                    <Link href={`/solicitacoes/${s.id}`} className="mini-item">
                      <span className="mini-icon"><Truck size={15} /></span>
                      <span className="mini-title">{s.nomeAdmitido}<small>{s.envio?.transportadora}{s.envio?.codigoRastreio ? ` · ${s.envio.codigoRastreio}` : ''}</small></span>
                      <span className="mini-badges">{s.previsaoEntrega ? <Badge tom={atrasado ? 'red' : 'cyan'}>{atrasado ? <AlarmClock size={11} /> : null}{curta(s.previsaoEntrega)}</Badge> : <Badge tom="slate">Sem previsão</Badge>}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <details className="card more-details" open={mais || undefined} onToggle={(e) => setMais(e.currentTarget.open)}>
        <summary><span><Gauge size={16} /> Mais indicadores</span><span className="muted small hide-sm">semana, gráficos, agenda e atividade</span><ChevronDown size={16} className="chev" aria-hidden="true" /></summary>
        {mais && d && <MaisIndicadores d={d} />}
      </details>
    </div>
  );
}

// Só é montado (e só busca a agenda da semana) quando "Mais indicadores" está aberto
function MaisIndicadores({ d }) {
  const ui = useUI();
  const router = useRouter();
  const { toast } = useToast();
  const k = d.kpis;
  const ini = isoLocal();
  const fim = isoLocal(new Date(Date.now() + 6 * 86400000));
  const { data: semana } = useApi(() => api.eventos.listar({ de: ini, ate: fim }), [ini, fim]);
  const { data: ativas } = useApi(() => api.solicitacoes.listar({ status: 'ativas' }), []);
  const dias = Array.from({ length: 7 }, (_, i) => isoLocal(new Date(Date.now() + i * 86400000)));

  async function concluir(ev) {
    try { await api.eventos.atualizar(ev.id, { concluido: true }); toast({ tipo: 'sucesso', titulo: 'Tarefa concluída' }); }
    catch (e) { toast({ tipo: 'erro', titulo: 'Erro', msg: e.message }); }
  }

  return (
    <div className="stack-lg mt-12">
      <section className="week-strip" aria-label="Próximos 7 dias">
        {dias.map((dia, i) => {
          const evs = (semana || []).filter((e) => e.data === dia && !e.concluido);
          const adm = (ativas || []).filter((s) => s.dataAdmissao === dia);
          const dt = parseISO(dia);
          return (
            <button key={dia} type="button" className={`week-day ${i === 0 ? 'today' : ''}`} onClick={() => router.push(`/agenda?data=${dia}`)}>
              <span className="wd-name">{i === 0 ? 'Hoje' : DIAS_CURTOS[dt.getDay()]}</span>
              <span className="wd-num">{dt.getDate()}</span>
              <span className="wd-count">{adm.length ? `${adm.length} admiss${adm.length === 1 ? 'ão' : 'ões'}` : evs.length ? `${evs.length} ${evs.length === 1 ? 'tarefa' : 'tarefas'}` : 'livre'}</span>
            </button>
          );
        })}
      </section>

      <div className="grid-3">
        <div className="span-2">
          <h3 className="sub-title"><Activity size={15} /> Solicitações nos últimos 14 dias</h3>
          <AreaChart labels={d.serieSolicitacoes.map((s) => curta(s.dia))}
            series={[{ nome: 'Abertas', cor: 'var(--blue-fg)', valores: d.serieSolicitacoes.map((s) => s.abertas) },
              { nome: 'Entregues', cor: 'var(--green-fg)', valores: d.serieSolicitacoes.map((s) => s.entregues) }]} />
        </div>
        <div>
          <h3 className="sub-title"><Gauge size={15} /> Por status</h3>
          <Donut subCentro="no total" dados={STATUS_SOLICITACAO.map((st) => ({ label: st, valor: d.solicitacoesPorStatus[st] || 0, cor: `var(--${TOM_SOLICITACAO[st]}-fg)` })).filter((x) => x.valor)} />
        </div>
      </div>

      <div className="grid-3">
        <div>
          <h3 className="sub-title"><Building2 size={15} /> Desempenho</h3>
          <div className="rings">
            <div><Ring valor={k.entregasNoPrazo} cor="var(--green-fg)" label="Entregues até a admissão" /><span>No prazo</span></div>
            <div><Ring valor={k.taxaUso} label="Equipamentos em uso" /><span>Em uso</span></div>
            <div><Ring valor={k.coberturaGarantia} cor="var(--violet-fg)" label="Cobertura de garantia" /><span>Garantia</span></div>
          </div>
          {d.maisPedidos.length > 0 && <div className="mt-12"><HBars dados={d.maisPedidos.slice(0, 4).map((x) => ({ label: x.label, valor: x.valor }))} /></div>}
        </div>
        <div>
          <h3 className="sub-title"><CalendarDays size={15} /> Próximos na agenda</h3>
          {d.proximosEventos.length === 0 ? <p className="muted small">Nenhuma tarefa futura.</p> : (
            <ul className="task-list">
              {d.proximosEventos.map((e) => (
                <li key={e.id} className={`task tone-${TOM_EVENTO[e.tipo]}`}>
                  <button type="button" className="task-check" onClick={() => concluir(e)} aria-label={`Concluir ${e.titulo}`} />
                  <button type="button" className="task-main" onClick={() => ui.abrir('evento', { evento: e })}>
                    <strong>{e.titulo}</strong>
                    <small>{e.data === ini ? 'Hoje' : `${parseISO(e.data).getDate()} ${MESES[parseISO(e.data).getMonth()].slice(0, 3)}`}{e.hora && ` · ${e.hora}`} · {e.tipo}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="sub-title"><Activity size={15} /> Atividade recente</h3>
          <ol className="timeline compact">{d.atividade.slice(0, 6).map((h) => <AtividadeItem key={h.id} h={h} compacto />)}</ol>
        </div>
      </div>
    </div>
  );
}

'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, CalendarRange, List, LayoutGrid, ShieldAlert, Clock, AlertCircle, Check, UserPlus, Truck } from 'lucide-react';
import { PageHeader, Segmented, Skeleton, EmptyState, Badge } from '@/components/ui';
import { useUI, useToast } from '@/components/providers';
import { useApi, useLocalState } from '@/lib/hooks';
import { api } from '@/lib/api';
import { isoLocal, parseISO, MESES, DIAS_CURTOS, data as fmtData } from '@/lib/format';
import { TOM_EVENTO } from '@/lib/constants';

const addDias = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return isoLocal(d); };
const TIPOS_LEGENDA = ['Manutenção', 'Entrega', 'Devolução', 'Renovação', 'Auditoria', 'Reunião'];

function Planner() {
  const params = useSearchParams();
  const router = useRouter();
  const ui = useUI();
  const { toast } = useToast();
  const hoje = isoLocal();
  const [sel, setSel] = useState(params.get('data') || hoje);
  const [cursor, setCursor] = useState(() => { const d = parseISO(params.get('data') || hoje); return { a: d.getFullYear(), m: d.getMonth() }; });
  const [visao, setVisao] = useLocalState('ativotech:visao-agenda', 'mes');
  const [camadas, setCamadas] = useLocalState('ativotech:camadas-v3', { eventos: true, garantias: true, entregas: true, admissoes: true });
  const [arrastando, setArrastando] = useState(null);
  const [sobre, setSobre] = useState(null);

  useEffect(() => {
    const p = params.get('data');
    if (p) { setSel(p); const d = parseISO(p); setCursor({ a: d.getFullYear(), m: d.getMonth() }); }
  }, [params]);

  // Intervalo visível
  const primeiro = new Date(cursor.a, cursor.m, 1);
  const inicioGrade = isoLocal(new Date(cursor.a, cursor.m, 1 - primeiro.getDay()));
  const dias = Array.from({ length: 42 }, (_, i) => addDias(inicioGrade, i));
  const inicioSemana = addDias(sel, -parseISO(sel).getDay());
  const semana = Array.from({ length: 7 }, (_, i) => addDias(inicioSemana, i));
  const de = visao === 'lista' ? hoje : visao === 'semana' ? semana[0] : dias[0];
  const ate = visao === 'lista' ? addDias(hoje, 60) : visao === 'semana' ? semana[6] : dias[41];

  const { data: eventos, setData: setEventos } = useApi(() => api.eventos.listar({ de, ate }), [de, ate]);
  const { data: atrasados } = useApi(() => api.eventos.listar({ ate: addDias(hoje, -1), pendentes: 1 }), [hoje]);
  const { data: ativos } = useApi(() => api.ativos.listar({ campos: 'lista' }), []);
  const { data: solicitacoes } = useApi(() => api.solicitacoes.listar({ status: 'ativas' }), []);

  // Junta tarefas, admissões, previsões de entrega e vencimentos de garantia numa só lista
  const itens = useMemo(() => {
    const l = [];
    if (camadas.eventos) for (const e of eventos || []) l.push({ key: e.id, origem: 'evento', titulo: e.titulo, tipo: e.tipo, data: e.data, hora: e.hora, ref: e, concluido: e.concluido });
    if (camadas.garantias) for (const a of ativos || []) {
      if (a.garantiaAte && a.status !== 'Descartado' && a.garantiaAte >= de && a.garantiaAte <= ate)
        l.push({ key: `g-${a.id}`, origem: 'garantia', titulo: `Garantia: ${a.patrimonio}`, sub: a.nome, tipo: 'Garantia', data: a.garantiaAte, ref: a });
    }
    for (const s of solicitacoes || []) {
      if (camadas.admissoes && s.dataAdmissao >= de && s.dataAdmissao <= ate)
        l.push({ key: `adm-${s.id}`, origem: 'admissao', titulo: `Admissão: ${s.nomeAdmitido}`, sub: `${s.numero} · ${s.status} · ${s.itensResumo}`, tipo: 'Admissão', data: s.dataAdmissao, ref: s });
      if (camadas.entregas && s.previsaoEntrega && s.previsaoEntrega >= de && s.previsaoEntrega <= ate)
        l.push({ key: `prev-${s.id}`, origem: 'entrega', titulo: `Entrega ${s.numero}`, sub: `${s.nomeAdmitido}${s.envio?.transportadora ? ` · ${s.envio.transportadora}` : ''}`, tipo: 'Previsão de entrega', data: s.previsaoEntrega, ref: s });
    }
    return l.sort((x, y) => (x.data + (x.hora || '99')).localeCompare(y.data + (y.hora || '99')));
  }, [eventos, ativos, solicitacoes, camadas, de, ate]);

  const porDia = useMemo(() => itens.reduce((m, i) => { (m[i.data] ||= []).push(i); return m; }, {}), [itens]);

  const navegar = (n) => {
    if (visao === 'semana') { const s = addDias(sel, n * 7); setSel(s); const d = parseISO(s); setCursor({ a: d.getFullYear(), m: d.getMonth() }); return; }
    setCursor((c) => { const d = new Date(c.a, c.m + n, 1); return { a: d.getFullYear(), m: d.getMonth() }; });
  };
  const irHoje = () => { setSel(hoje); const d = new Date(); setCursor({ a: d.getFullYear(), m: d.getMonth() }); };

  async function alternarConcluido(ev) {
    setEventos((l) => l?.map((e) => (e.id === ev.id ? { ...e, concluido: !e.concluido } : e)));
    try { await api.eventos.atualizar(ev.id, { concluido: !ev.concluido }); } catch (e) { toast({ tipo: 'erro', titulo: 'Erro', msg: e.message }); }
  }

  async function moverEvento(id, novaData) {
    const ev = (eventos || []).find((e) => e.id === id);
    if (!ev || ev.data === novaData) return;
    setEventos((l) => l.map((e) => (e.id === id ? { ...e, data: novaData } : e)));
    try {
      await api.eventos.atualizar(id, { data: novaData });
      toast({ tipo: 'sucesso', titulo: 'Evento remarcado', msg: `${ev.titulo} → ${fmtData(novaData)}`, duracao: 2500 });
    } catch (e) { toast({ tipo: 'erro', titulo: 'Erro ao remarcar', msg: e.message }); }
  }

  const abrirItem = (i) => {
    if (i.origem === 'evento') ui.abrir('evento', { evento: i.ref });
    else if (i.origem === 'garantia') router.push(`/ativos/${i.ref.id}`);
    else router.push(`/solicitacoes/${i.ref.id}`);
  };

  const chip = (i, compacto) => (
    <button key={i.key} type="button" className={`ev-chip tone-${TOM_EVENTO[i.tipo]} ${i.concluido ? 'done' : ''} ${i.origem !== 'evento' ? 'derived' : ''}`}
      draggable={i.origem === 'evento'} onDragStart={(e) => { e.dataTransfer.setData('text/plain', i.ref.id); setArrastando(i.ref.id); }}
      onDragEnd={() => { setArrastando(null); setSobre(null); }}
      onClick={(e) => { e.stopPropagation(); abrirItem(i); }} title={`${i.titulo}${i.sub ? ` — ${i.sub}` : ''}`}>
      {i.origem === 'garantia' ? <ShieldAlert size={11} /> : i.origem === 'entrega' ? <Truck size={11} /> : i.origem === 'admissao' ? <UserPlus size={11} /> : null}
      {!compacto && i.hora && <span className="ev-time">{i.hora}</span>}
      <span className="ev-title">{i.titulo}</span>
    </button>
  );

  const dropProps = (dia) => ({
    onDragOver: (e) => { if (arrastando) { e.preventDefault(); setSobre(dia); } },
    onDragLeave: () => setSobre((s) => (s === dia ? null : s)),
    onDrop: (e) => { e.preventDefault(); setSobre(null); moverEvento(e.dataTransfer.getData('text/plain'), dia); }
  });

  const itensSel = porDia[sel] || [];
  const pendSemana = (eventos || []).filter((e) => !e.concluido && e.data >= hoje && e.data <= addDias(hoje, 6));
  const titulo = visao === 'semana'
    ? `${parseISO(semana[0]).getDate()} ${MESES[parseISO(semana[0]).getMonth()].slice(0, 3)} – ${parseISO(semana[6]).getDate()} ${MESES[parseISO(semana[6]).getMonth()].slice(0, 3)} ${parseISO(semana[6]).getFullYear()}`
    : visao === 'lista' ? 'Próximos 60 dias' : `${MESES[cursor.m]} ${cursor.a}`;

  return (
    <div className="page page-wide">
      <PageHeader icone={CalendarDays} titulo="Agenda" subtitulo="Planner de manutenções, entregas, admissões e prazos — arraste eventos para remarcar.">
        <button type="button" className="btn btn-primary" onClick={() => ui.abrir('evento', { data: sel })}><Plus size={16} /> Novo evento</button>
      </PageHeader>

      <div className="planner">
        <div className="card planner-main no-pad">
          <div className="cal-toolbar">
            <div className="cal-nav">
              {visao !== 'lista' && <>
                <button type="button" className="icon-btn" onClick={() => navegar(-1)} aria-label="Anterior"><ChevronLeft size={18} /></button>
                <button type="button" className="icon-btn" onClick={() => navegar(1)} aria-label="Próximo"><ChevronRight size={18} /></button>
              </>}
              <button type="button" className="btn btn-sm" onClick={irHoje}>Hoje</button>
              <h2 className="cal-title">{titulo}</h2>
            </div>
            <Segmented label="Visualização" valor={visao} onChange={setVisao} opcoes={[
              { id: 'mes', label: 'Mês', icone: LayoutGrid }, { id: 'semana', label: 'Semana', icone: CalendarRange }, { id: 'lista', label: 'Lista', icone: List }
            ]} />
          </div>
          <div className="layer-row">
            {[['eventos', 'Tarefas'], ['admissoes', 'Admissões'], ['entregas', 'Previsões de entrega'], ['garantias', 'Vencimento de garantias']].map(([k, l]) => (
              <label key={k} className={`layer-toggle layer-${k} ${camadas[k] ? 'on' : ''}`}>
                <input type="checkbox" checked={camadas[k]} onChange={() => { setCamadas((c) => ({ ...c, [k]: !c[k] })); }} />
                <span className="layer-box">{camadas[k] && <Check size={11} />}</span>{l}
              </label>
            ))}
          </div>

          {visao === 'mes' && (
            <div className="cal-month" role="grid" aria-label={titulo}>
              {DIAS_CURTOS.map((d) => <div key={d} className="cal-dow" role="columnheader">{d}</div>)}
              {dias.map((dia) => {
                const lista = porDia[dia] || [];
                const fora = parseISO(dia).getMonth() !== cursor.m;
                return (
                  <div key={dia} role="gridcell" tabIndex={0} aria-selected={sel === dia}
                    className={`cal-cell ${fora ? 'out' : ''} ${dia === hoje ? 'today' : ''} ${sel === dia ? 'sel' : ''} ${sobre === dia ? 'drop-over' : ''} ${dia < hoje ? 'past' : ''}`}
                    onClick={() => { setSel(dia); }} onDoubleClick={() => ui.abrir('evento', { data: dia })}
                    onKeyDown={(e) => { if (e.key === 'Enter') setSel(dia); }} {...dropProps(dia)}>
                    <span className="cal-num">{parseISO(dia).getDate()}</span>
                    <div className="cal-items">
                      {lista.slice(0, 3).map((i) => chip(i, true))}
                      {lista.length > 3 && <span className="cal-more">+{lista.length - 3} mais</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {visao === 'semana' && (
            <div className="cal-week">
              {semana.map((dia) => (
                <div key={dia} className={`week-col ${dia === hoje ? 'today' : ''} ${sel === dia ? 'sel' : ''} ${sobre === dia ? 'drop-over' : ''}`}
                  onClick={() => setSel(dia)} onDoubleClick={() => ui.abrir('evento', { data: dia })} {...dropProps(dia)}>
                  <div className="week-col-head"><span>{DIAS_CURTOS[parseISO(dia).getDay()]}</span><strong>{parseISO(dia).getDate()}</strong></div>
                  <div className="week-col-body">
                    {(porDia[dia] || []).map((i) => chip(i, false))}
                    <button type="button" className="week-add" onClick={(e) => { e.stopPropagation(); ui.abrir('evento', { data: dia }); }} aria-label={`Adicionar em ${fmtData(dia)}`}><Plus size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {visao === 'lista' && (
            <div className="agenda-list">
              {!eventos ? <Skeleton h={200} /> : Object.keys(porDia).length === 0 ? <EmptyState icon={CalendarDays} titulo="Nada nos próximos 60 dias" /> :
                Object.entries(porDia).map(([dia, l]) => (
                  <div key={dia} className="agenda-day">
                    <div className={`agenda-date ${dia === hoje ? 'today' : ''}`}><strong>{parseISO(dia).getDate()}</strong><span>{DIAS_CURTOS[parseISO(dia).getDay()]}, {MESES[parseISO(dia).getMonth()].slice(0, 3)}</span></div>
                    <ul>{l.map((i) => (
                      <li key={i.key} className={`agenda-item tone-${TOM_EVENTO[i.tipo]} ${i.concluido ? 'done' : ''}`}>
                        {i.origem === 'evento' && <button type="button" className={`task-check ${i.concluido ? 'checked' : ''}`} onClick={() => alternarConcluido(i.ref)} aria-label="Concluir" />}
                        <button type="button" className="agenda-main" onClick={() => abrirItem(i)}>
                          <strong>{i.titulo}</strong><small>{[i.hora, i.tipo, i.sub || i.ref.responsavel].filter(Boolean).join(' · ')}</small>
                        </button>
                      </li>
                    ))}</ul>
                  </div>
                ))}
            </div>
          )}
        </div>

        <aside className="planner-side">
          <div className="card day-card">
            <div className="day-card-head">
              <div className="day-big"><strong>{parseISO(sel).getDate()}</strong><span>{MESES[parseISO(sel).getMonth()].slice(0, 3)}</span></div>
              <div><h3>{parseISO(sel).toLocaleDateString('pt-BR', { weekday: 'long' })}</h3><small className="muted">{sel === hoje ? 'Hoje' : fmtData(sel)} · {itensSel.length} {itensSel.length === 1 ? 'item' : 'itens'}</small></div>
              <button type="button" className="icon-btn" onClick={() => ui.abrir('evento', { data: sel })} aria-label="Adicionar evento neste dia"><Plus size={17} /></button>
            </div>
            {itensSel.length === 0 ? <p className="muted small day-empty">Dia livre. Clique duas vezes num dia do calendário para agendar.</p> : (
              <ul className="task-list">
                {itensSel.map((i) => (
                  <li key={i.key} className={`task tone-${TOM_EVENTO[i.tipo]} ${i.concluido ? 'done' : ''}`}>
                    {i.origem === 'evento' ? <button type="button" className={`task-check ${i.concluido ? 'checked' : ''}`} onClick={() => alternarConcluido(i.ref)} aria-label={i.concluido ? 'Reabrir' : 'Concluir'} />
                      : <span className="task-icon">{i.origem === 'garantia' ? <ShieldAlert size={14} /> : i.origem === 'admissao' ? <UserPlus size={14} /> : i.origem === 'entrega' ? <Truck size={14} /> : <Clock size={14} />}</span>}
                    <button type="button" className="task-main" onClick={() => abrirItem(i)}>
                      <strong>{i.titulo}</strong><small>{[i.hora, i.tipo, i.sub || i.ref.responsavel, i.ref.ativo?.patrimonio].filter(Boolean).join(' · ')}</small>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {atrasados?.length > 0 && (
            <div className="card side-card tone-red">
              <h3 className="side-title"><AlertCircle size={16} /> Atrasadas <Badge tom="red">{atrasados.length}</Badge></h3>
              <ul className="task-list">
                {atrasados.map((e) => (
                  <li key={e.id} className={`task tone-${TOM_EVENTO[e.tipo]}`}>
                    <button type="button" className="task-check" onClick={() => alternarConcluido(e)} aria-label="Concluir" />
                    <button type="button" className="task-main" onClick={() => ui.abrir('evento', { evento: e })}><strong>{e.titulo}</strong><small>{fmtData(e.data)} · {e.tipo}</small></button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="card side-card">
            <h3 className="side-title"><CalendarRange size={16} /> Próximos 7 dias <Badge tom="blue">{pendSemana.length}</Badge></h3>
            {pendSemana.length === 0 ? <p className="muted small">Nenhuma tarefa pendente.</p> : (
              <ul className="task-list">
                {pendSemana.map((e) => (
                  <li key={e.id} className={`task tone-${TOM_EVENTO[e.tipo]}`}>
                    <button type="button" className="task-check" onClick={() => alternarConcluido(e)} aria-label="Concluir" />
                    <button type="button" className="task-main" onClick={() => { setSel(e.data); }}><strong>{e.titulo}</strong><small>{e.data === hoje ? 'Hoje' : fmtData(e.data)}{e.hora && ` · ${e.hora}`}</small></button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card side-card legend-card">
            <h3 className="side-title">Legenda</h3>
            <div className="legend-grid">
              {TIPOS_LEGENDA.map((t) => <span key={t}><i className={`dot-${TOM_EVENTO[t]}`} />{t}</span>)}
              <span><i className="dot-red" />Garantia</span><span><i className="dot-green" />Previsão de entrega</span><span><i className="dot-pink" />Admissão</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function Agenda() {
  return <Suspense fallback={<Skeleton h={500} />}><Planner /></Suspense>;
}

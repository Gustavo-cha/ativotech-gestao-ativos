'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Pencil, Trash2, ArrowDownUp, CalendarPlus, ArrowRightLeft, LayoutGrid, History, CalendarDays, Fingerprint, Users, Network, Wallet, ShieldCheck, StickyNote, Copy, MapPin, Clock, Bookmark, Lock, Building2, Mail, UserRoundPlus, UserRoundX } from 'lucide-react';
import { Tabs, Menu, MenuItem, StatusBadge, GarantiaBadge, CategoriaIcon, Avatar, Progress, Skeleton, ErroApi, EmptyState, Badge, Modal, Field } from '@/components/ui';
import { AtividadeItem } from '@/components/AtividadeItem';
import ColaboradorPicker from '@/components/ColaboradorPicker';
import { useAuth } from '@/components/auth';
import { useUI, useToast } from '@/components/providers';
import { useApi } from '@/lib/hooks';
import { api } from '@/lib/api';
import { moeda, data as fmtData, dataHora, idade, relativo } from '@/lib/format';
import { TOM_EVENTO, TIPO_MOVIMENTACAO } from '@/lib/constants';

const STATUS = ['Disponível', 'Em uso', 'Em manutenção', 'Descartado'];

export default function DetalheAtivo() {
  const { id } = useParams();
  const router = useRouter();
  const ui = useUI();
  const { toast } = useToast();
  const [aba, setAba] = useState('geral');
  const { pode } = useAuth();
  const [alocar, setAlocar] = useState(null); // null | { status }
  const [colab, setColab] = useState(null);
  const [resp, setResp] = useState('');
  const [errosAloc, setErrosAloc] = useState({});
  const { data: a, erro } = useApi(() => api.ativos.obter(id), [id]);
  // Abas secundárias só carregam quando abertas
  const { data: movs } = useApi(() => (aba === 'movimentacoes' ? api.estoque.movimentacoes({ ativoId: id }) : Promise.resolve(null)), [id, aba === 'movimentacoes']);
  const { data: eventos } = useApi(() => (aba === 'agenda' ? api.eventos.listar({ ativoId: id }) : Promise.resolve(null)), [id, aba === 'agenda']);
  const { data: hist } = useApi(() => (aba === 'historico' ? api.historico({ entidadeId: id }) : Promise.resolve(null)), [id, aba === 'historico']);

  if (erro) return <div className="page"><Link href="/ativos" className="back-link"><ArrowLeft size={15} /> Ativos</Link><ErroApi erro={erro} /></div>;
  if (!a) return <div className="page"><Skeleton h={150} /><Skeleton h={320} style={{ marginTop: 16 }} /></div>;

  async function mudarStatus(status, responsavel) {
    if (status === 'Em uso' && !a.responsavel && !a.colaborador && !responsavel) { abrirAlocacao(); return; }
    try {
      await api.ativos.mudarStatus(a.id, status, responsavel);
      toast({ tipo: 'sucesso', titulo: `Status: ${status}` });
    } catch (e) { toast({ tipo: 'erro', titulo: 'Não foi possível mudar o status', msg: e.message }); }
  }

  function abrirAlocacao() { setColab(null); setResp(''); setErrosAloc({}); setAlocar({}); }
  // Aloca a um colaborador (existente ou novo) ou a uma equipe; o equipamento passa a "Em uso"
  async function confirmarAlocacao() {
    try {
      if (colab?.colaborador) await api.colaboradores.vincular(colab.colaborador.id, a.id);
      else if (colab?.novo) {
        const c = await api.colaboradores.criar(colab.novo);
        await api.colaboradores.vincular(c.id, a.id);
      } else if (resp.trim()) await api.ativos.mudarStatus(a.id, 'Em uso', resp.trim());
      else { setErrosAloc({ colaboradorId: 'Escolha o colaborador ou informe a equipe.' }); return; }
      setAlocar(null);
      toast({ tipo: 'sucesso', titulo: `${a.patrimonio} alocado` });
    } catch (e) {
      setErrosAloc(Object.fromEntries(Object.entries(e.campos || {}).map(([k, v]) => [`novoColaborador.${k}`, v])));
      toast({ tipo: 'erro', titulo: 'Não foi possível alocar', msg: e.message });
    }
  }
  async function desvincular() {
    if (!window.confirm(`Desvincular ${a.colaborador.nome} deste equipamento?`)) return;
    try { await api.colaboradores.vincular(a.colaborador.id, a.id, false); toast({ tipo: 'sucesso', titulo: 'Colaborador desvinculado' }); }
    catch (e) { toast({ tipo: 'erro', titulo: 'Não foi possível desvincular', msg: e.message }); }
  }

  async function excluir() {
    if (!window.confirm(`Excluir ${a.patrimonio} — ${a.nome}? Esta ação não pode ser desfeita.`)) return;
    await api.ativos.excluir(a.id);
    toast({ tipo: 'info', titulo: `${a.patrimonio} excluído` });
    router.push('/ativos');
  }

  const copiar = (txt) => { navigator.clipboard?.writeText(txt); toast({ tipo: 'sucesso', titulo: 'Copiado', duracao: 1500 }); };
  const pendentes = eventos ? eventos.filter((e) => !e.concluido).length : undefined;
  const gTotal = a.dataAquisicao && a.garantiaAte ? Date.parse(a.garantiaAte) - Date.parse(a.dataAquisicao) : 0;
  const gPct = gTotal > 0 ? Math.min(100, ((Date.now() - Date.parse(a.dataAquisicao)) / gTotal) * 100) : 0;
  const vidaPct = a.idadeMeses !== null ? Math.min(100, (a.idadeMeses / (a.vidaUtilAnos * 12)) * 100) : 0;

  const Info = ({ label, valor, mono, copy }) => (
    <div className="info-cell" key={label}>
      <dt>{label}</dt>
      <dd className={mono ? 'mono' : ''}>{valor || <span className="muted">—</span>}
        {copy && valor && <button type="button" className="icon-btn ghost xs" onClick={() => copiar(valor)} aria-label={`Copiar ${label}`}><Copy size={12} /></button>}</dd>
    </div>
  );

  return (
    <div className="page">
      <Link href="/ativos" className="back-link"><ArrowLeft size={15} /> Inventário</Link>

      {a.reserva && (
        <div className="reserva-banner">
          <Bookmark size={18} />
          <div><strong>Reservado para {a.reserva.numero} · {a.reserva.nomeAdmitido}</strong>
            <span className="small">Admissão em {fmtData(a.reserva.dataAdmissao)} · solicitação {a.reserva.status.toLowerCase()}. O status deste notebook só muda pelo fluxo da solicitação, para manter o estoque do RH correto.</span></div>
          <Link href={`/solicitacoes/${a.reserva.id}`} className="btn btn-sm">Abrir solicitação</Link>
        </div>
      )}

      <section className="card asset-hero">
        <CategoriaIcon categoria={a.categoria} boxed size={30} />
        <div className="asset-hero-main">
          <div className="badge-row"><span className="mono muted">{a.patrimonio}</span><span className={`owner-tag ${a.proprietario === 'H&CO B2Finance' ? 'b2f' : ''}`}><Building2 size={11} /> {a.proprietario}</span><StatusBadge status={a.status} /><GarantiaBadge status={a.garantiaStatus} />
            {a.fimDeVida && <Badge tom="orange">Fim da vida útil</Badge>}{a.tags.map((t) => <span className="tag sm" key={t}>{t}</span>)}</div>
          <h1>{a.nome}</h1>
          <p className="muted hero-meta">
            <span><MapPin size={14} /> {a.localizacao || 'Sem localização'}</span>
            <span><Clock size={14} /> {a.diasNoStatus !== null ? `${a.diasNoStatus} dias neste status` : '—'}</span>
            {a.colaborador ? <span className="cell-person"><Avatar nome={a.colaborador.nome} size={22} /> {a.colaborador.nome}</span>
              : a.responsavel && <span className="cell-person"><Avatar nome={a.responsavel} size={22} /> {a.responsavel}</span>}
          </p>
        </div>
        <div className="asset-hero-actions">
          {a.reserva ? (
            <button type="button" className="btn" disabled title="Notebook reservado: o status muda pelo fluxo da solicitação"><Lock size={16} /> Status travado</button>
          ) : (
            <Menu trigger={({ alternar }) => <button type="button" className="btn" onClick={alternar}><ArrowRightLeft size={16} /> Mudar status</button>}>
              {STATUS.filter((s) => s !== a.status).map((s) => <MenuItem key={s} onClick={() => mudarStatus(s)}>{s}</MenuItem>)}
            </Menu>
          )}
          {!a.reserva && a.status !== 'Descartado' && pode('colaboradores:gerenciar') && (
            <button type="button" className="btn" onClick={abrirAlocacao}><UserRoundPlus size={16} /> {a.colaborador ? 'Realocar' : 'Alocar'}</button>
          )}
          <Link href={`/ativos/${a.id}/editar`} className="btn btn-primary"><Pencil size={16} /> Editar</Link>
          <Menu trigger={({ alternar }) => <button type="button" className="icon-btn" onClick={alternar} aria-label="Mais ações">⋯</button>}>
            <MenuItem icone={CalendarPlus} onClick={() => ui.abrir('evento', { ativoId: a.id, titulo: `Manutenção — ${a.nome}` })}>Agendar manutenção</MenuItem>
            {a.colaborador && <MenuItem icone={UserRoundX} onClick={desvincular}>Desvincular colaborador</MenuItem>}
            <MenuItem icone={Trash2} perigo onClick={excluir}>Excluir</MenuItem>
          </Menu>
        </div>
      </section>

      <div className="mini-kpis">
        <div><span>Valor atual</span><strong>{moeda(a.valorAtual)}</strong><small>de {moeda(a.valor)}</small></div>
        <div><span>Idade</span><strong>{idade(a.idadeMeses)}</strong><small>vida útil {a.vidaUtilAnos} anos</small></div>
        <div><span>Garantia</span><strong className={a.diasGarantia < 0 ? 'txt-red' : ''}>{a.diasGarantia === null ? '—' : a.diasGarantia < 0 ? `vencida há ${-a.diasGarantia}d` : `${a.diasGarantia} dias`}</strong><small>{fmtData(a.garantiaAte)}</small></div>
        <div><span>Proprietário</span><strong>{a.proprietario}</strong><small>{a.categoria}</small></div>
      </div>

      <Tabs ativa={aba} onChange={setAba} className="tabs-page" abas={[
        { id: 'geral', label: 'Visão geral', icone: LayoutGrid },
        { id: 'movimentacoes', label: 'Movimentações', icone: ArrowDownUp, qtd: movs?.length },
        { id: 'agenda', label: 'Agenda', icone: CalendarDays, qtd: pendentes },
        { id: 'historico', label: 'Histórico', icone: History, qtd: hist?.length }
      ]} />

      <div className="tab-panel" key={aba}>
        {aba === 'geral' && (
          <div className="detail-grid">
            <section className="card"><h2 className="section-title"><Fingerprint size={17} /> Identificação</h2>
              <dl className="info-grid"><Info label="Categoria" valor={a.categoria} /><Info label="Marca" valor={a.marca} /><Info label="Modelo" valor={a.modelo} /><Info label="Nº de série" valor={a.numeroSerie} mono copy /></dl></section>
            <section className="card"><h2 className="section-title"><Users size={17} /> Alocação</h2>
              <dl className="info-grid">
                {a.colaborador ? <><Info label="Colaborador" valor={a.colaborador.nome} /><Info label="E-mail corporativo" valor={a.colaborador.email} copy /></> : <Info label="Responsável" valor={a.responsavel} />}
                <Info label="Proprietário" valor={a.proprietario} /><Info label="Departamento" valor={a.departamento} /><Info label="Localização" valor={a.localizacao} /><Info label="No status desde" valor={a.statusDesde && `${fmtData(a.statusDesde)} (${relativo(a.statusDesde)})`} /></dl>
              {a.colaborador && <Link href={`/colaboradores?id=${a.colaborador.id}`} className="link-btn small"><Mail size={13} /> Ver equipamentos deste colaborador</Link>}</section>
            <section className="card"><h2 className="section-title"><Network size={17} /> Rede e sistema</h2>
              <dl className="info-grid"><Info label="Hostname" valor={a.hostname} mono copy /><Info label="Endereço IP" valor={a.ip} mono copy /><Info label="Sistema operacional" valor={a.sistemaOperacional} />{a.configuracao && <Info label="Configuração de hardware" valor={a.configuracao} />}</dl></section>
            <section className="card"><h2 className="section-title"><Wallet size={17} /> Financeiro</h2>
              <dl className="info-grid"><Info label="Valor de compra" valor={moeda(a.valor)} /><Info label="Valor atual" valor={moeda(a.valorAtual)} /><Info label="Fornecedor" valor={a.fornecedor} /><Info label="Nota fiscal" valor={a.notaFiscal} /><Info label="Entrada no estoque" valor={a.dataEntradaEstoque && fmtData(a.dataEntradaEstoque)} /></dl>
              <div className="bar-block"><div className="row-between small"><span>Vida útil consumida</span><strong>{Math.round(vidaPct)}%</strong></div><Progress valor={vidaPct} tom={vidaPct >= 100 ? 'red' : vidaPct > 75 ? 'amber' : 'accent'} label="Vida útil consumida" /></div></section>
            <section className="card"><h2 className="section-title"><ShieldCheck size={17} /> Garantia</h2>
              <dl className="info-grid"><Info label="Aquisição" valor={fmtData(a.dataAquisicao)} /><Info label="Garantia até" valor={fmtData(a.garantiaAte)} /></dl>
              {gTotal > 0 && <div className="bar-block"><div className="row-between small"><span>Período de garantia</span><GarantiaBadge status={a.garantiaStatus} /></div>
                <Progress valor={gPct} tom={a.garantiaStatus === 'vencida' ? 'red' : a.garantiaStatus === 'vencendo' ? 'amber' : 'green'} label="Garantia consumida" /></div>}
              {a.garantiaStatus !== 'vigente' && a.garantiaStatus !== 'sem' && (
                <button type="button" className="btn btn-sm btn-soft" onClick={() => ui.abrir('evento', { ativoId: a.id, tipo: 'Renovação', titulo: `Renovar garantia — ${a.nome}` })}><CalendarPlus size={14} /> Agendar renovação</button>
              )}</section>
            <section className="card"><h2 className="section-title"><StickyNote size={17} /> Observações</h2>
              <p className={a.observacoes ? 'pre' : 'muted'}>{a.observacoes || 'Nenhuma observação.'}</p>
              <p className="muted small">Cadastrado {relativo(a.criadoEm)} · atualizado {relativo(a.atualizadoEm)}</p></section>
          </div>
        )}

        {aba === 'movimentacoes' && (
          <div className="card no-pad">
            {!movs?.length ? (
              <EmptyState icon={ArrowDownUp} titulo="Nenhuma movimentação" texto="Entradas, reservas, envios e entregas deste equipamento aparecem aqui." />
            ) : (
              <ul className="row-list">
                {movs.map((m) => {
                  const t = TIPO_MOVIMENTACAO[m.tipo] || { label: m.tipo, tom: 'slate' };
                  return (
                    <li key={m.id} className="row-item static">
                      <Badge tom={t.tom}>{t.label}</Badge>
                      <span className="grow"><strong>{m.numero ? <Link href={`/solicitacoes/${m.solicitacaoId}`}>{m.numero}</Link> : t.label}</strong><small className="muted">{m.motivo || '—'} · {m.usuario}</small></span>
                      <time className="small muted" title={dataHora(m.em)}>{relativo(m.em)}</time>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {aba === 'agenda' && (
          <div className="card no-pad">
            {!eventos?.length ? (
              <EmptyState icon={CalendarDays} titulo="Nada agendado para este ativo">
                <button type="button" className="btn btn-primary" onClick={() => ui.abrir('evento', { ativoId: a.id })}>Agendar</button>
              </EmptyState>
            ) : (
              <ul className="row-list">
                {eventos.map((e) => (
                  <li key={e.id}><button type="button" className={`row-item ${e.concluido ? 'done' : ''}`} onClick={() => ui.abrir('evento', { evento: e })}>
                    <span className={`date-chip tone-${TOM_EVENTO[e.tipo]}`}><strong>{e.data.slice(8, 10)}</strong><small>{e.data.slice(5, 7)}/{e.data.slice(2, 4)}</small></span>
                    <span className="grow"><strong>{e.titulo}</strong><small className="muted">{e.tipo}{e.hora && ` · ${e.hora}`}{e.responsavel && ` · ${e.responsavel}`}</small></span>
                    {e.concluido ? <Badge tom="green">Concluído</Badge> : e.atrasado ? <Badge tom="red">Atrasado</Badge> : <Badge tom="blue">Pendente</Badge>}
                  </button></li>
                ))}
              </ul>
            )}
          </div>
        )}

        {aba === 'historico' && (
          <div className="card">
            {!hist?.length ? <EmptyState icon={History} titulo="Sem histórico" /> : <ol className="timeline">{hist.map((h) => <AtividadeItem key={h.id} h={h} compacto />)}</ol>}
          </div>
        )}
      </div>

      <Modal aberto={Boolean(alocar)} onClose={() => setAlocar(null)} titulo={`Alocar ${a.patrimonio}`} subtitulo="O equipamento passa a “Em uso” com o colaborador escolhido." icone={UserRoundPlus} largura={560}
        rodape={<><button type="button" className="btn" onClick={() => setAlocar(null)}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={confirmarAlocacao}>Alocar</button></>}>
        <Field label="Colaborador" id="aloc-colab" wide dica="Busque pelo nome ou e-mail corporativo; se não existir, cadastre na hora.">
          <ColaboradorPicker id="aloc-colab" valor={colab} onChange={(v) => { setColab(v); setErrosAloc({}); }} erros={errosAloc} empresaPadrao={a.proprietario} autoFocus />
        </Field>
        {!colab && (
          <Field label="Ou equipe / área responsável" id="aloc-resp" dica="Para uso coletivo, sem colaborador específico">
            <input id="aloc-resp" value={resp} onChange={(e) => setResp(e.target.value)} placeholder="Ex.: Equipe de Infraestrutura" />
          </Field>
        )}
      </Modal>
    </div>
  );
}

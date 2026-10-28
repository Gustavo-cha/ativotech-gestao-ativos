'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { KanbanSquare, Search, GripVertical, Plus, Clock, Lock, Bookmark } from 'lucide-react';
import { PageHeader, CategoriaIcon, Avatar, GarantiaBadge, Modal, Field, Skeleton, ErroApi, Segmented } from '@/components/ui';
import { useToast } from '@/components/providers';
import { useApi } from '@/lib/hooks';
import { api } from '@/lib/api';
import { moeda } from '@/lib/format';
import { TOM_STATUS } from '@/lib/constants';

const COLUNAS = [
  { status: 'Disponível', desc: 'Prontos para entrega' },
  { status: 'Em uso', desc: 'Alocados a pessoas ou setores' },
  { status: 'Em manutenção', desc: 'Em reparo ou assistência' },
  { status: 'Descartado', desc: 'Baixados do patrimônio' }
];

export default function Quadro() {
  const { toast } = useToast();
  const { data, erro, setData, recarregar } = useApi(() => api.ativos.listar({ campos: 'lista' }), []);
  const { data: meta } = useApi(() => api.ativos.meta(), []);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [arrastando, setArrastando] = useState(null);
  const [sobre, setSobre] = useState(null);
  const [pendente, setPendente] = useState(null); // { ativo, status }
  const [resp, setResp] = useState('');
  const [dono, setDono] = useState('');
  // Colunas grandes mostram os primeiros cards; o restante aparece sob demanda (o quadro continua leve com milhares de equipamentos)
  const [limites, setLimites] = useState({});
  const POR_COLUNA = 40;

  const filtrados = useMemo(() => {
    const t = q.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    return (data || []).filter((a) => (!cat || a.categoria === cat) && (!dono || a.proprietario === dono) &&
      (!t || `${a.patrimonio} ${a.nome} ${a.responsavel}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(t)));
  }, [data, q, cat, dono]);

  async function mover(ativo, status, responsavel) {
    if (ativo.status === status) return;
    if (status === 'Em uso' && !ativo.responsavel && !responsavel) { setResp(''); setPendente({ ativo, status }); return; }
    // Atualização otimista: move o card na hora e confirma com a API
    const antes = data;
    setData((l) => l.map((a) => (a.id === ativo.id ? { ...a, status, responsavel: responsavel ?? (status === 'Disponível' || status === 'Descartado' ? '' : a.responsavel), diasNoStatus: 0, _novo: true } : a)));
    try {
      await api.ativos.mudarStatus(ativo.id, status, responsavel);
      toast({ tipo: 'sucesso', titulo: `${ativo.patrimonio} → ${status}`, duracao: 2500 });
    } catch (e) {
      setData(antes);
      toast({ tipo: 'erro', titulo: 'Não foi possível mover', msg: e.message });
    }
    setPendente(null);
  }

  const onDrop = (status) => (e) => {
    e.preventDefault();
    setSobre(null);
    const ativo = (data || []).find((a) => a.id === e.dataTransfer.getData('text/plain'));
    if (ativo?.reserva) toast({ tipo: 'aviso', titulo: `${ativo.patrimonio} está reservado`, msg: `Altere pelo fluxo de ${ativo.reserva.numero}.` });
    else if (ativo) mover(ativo, status);
    setArrastando(null);
  };

  return (
    <div className="page page-wide">
      <PageHeader icone={KanbanSquare} titulo="Quadro" subtitulo="Arraste os cards entre as colunas para mudar o status.">
        <Link href="/ativos/novo" className="btn btn-primary"><Plus size={16} /> Novo</Link>
      </PageHeader>
      <ErroApi erro={erro} onRetry={recarregar} />

      <div className="board-toolbar">
        <div className="search-input"><Search size={16} /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrar cards…" aria-label="Filtrar cards" /></div>
        <Segmented label="Proprietário" valor={dono} onChange={setDono} opcoes={[{ id: '', label: 'Todos' }, { id: 'H&CO', label: 'H&CO' }, { id: 'H&CO B2Finance', label: 'B2Finance' }]} />
        <div className="chip-select scroll-x" role="radiogroup" aria-label="Categoria">
          <button type="button" className={`chip ${!cat ? 'on' : ''}`} onClick={() => { setCat(''); }} role="radio" aria-checked={!cat}>Todas</button>
          {meta?.categorias.filter((c) => (data || []).some((a) => a.categoria === c)).map((c) => (
            <button key={c} type="button" role="radio" aria-checked={cat === c} className={`chip ${cat === c ? 'on' : ''}`} onClick={() => { setCat(c); }}>
              <CategoriaIcon categoria={c} size={13} /> {c}
            </button>
          ))}
        </div>
      </div>

      <div className="board">
        {COLUNAS.map((col) => {
          const todosCol = filtrados.filter((a) => a.status === col.status);
          const limite = limites[col.status] || POR_COLUNA;
          const itens = todosCol.slice(0, limite);
          return (
            <section key={col.status} className={`board-col tone-${TOM_STATUS[col.status]} ${sobre === col.status ? 'drop-over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); if (sobre !== col.status) setSobre(col.status); }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setSobre(null); }}
              onDrop={onDrop(col.status)} aria-label={`Coluna ${col.status}`}>
              <header className="board-col-head">
                <span className="col-dot" />
                <div><h2>{col.status}</h2><small className="muted">{col.desc}</small></div>
                <span className="col-count">{todosCol.length}</span>
              </header>
              <div className="board-col-sum muted small">{moeda(todosCol.reduce((s, a) => s + a.valorAtual, 0))} em valor atual</div>
              <div className="board-cards">
                {!data && <><Skeleton h={96} /><Skeleton h={96} /></>}
                {itens.map((a) => (
                  <article key={a.id} draggable={!a.reserva} className={`kcard ${arrastando === a.id ? 'dragging' : ''} ${a._novo ? 'just-dropped' : ''} ${a.reserva ? 'locked' : ''}`}
                    onDragStart={(e) => { e.dataTransfer.setData('text/plain', a.id); e.dataTransfer.effectAllowed = 'move'; setArrastando(a.id); }}
                    onDragEnd={() => { setArrastando(null); setSobre(null); }}>
                    <div className="kcard-top">
                      <CategoriaIcon categoria={a.categoria} boxed size={15} />
                      <span className="mono small muted">{a.patrimonio}</span>
                      {a.reserva ? <Lock size={14} className="grip" aria-label="Reservado" /> : <GripVertical size={15} className="grip" aria-hidden="true" />}
                    </div>
                    <Link href={`/ativos/${a.id}`} className="kcard-title">{a.nome}</Link>
                    <div className="kcard-meta">
                      {a.colaborador || a.responsavel ? <span className="cell-person"><Avatar nome={a.colaborador?.nome || a.responsavel} size={20} /> {a.colaborador?.nome || a.responsavel}</span> : <span className="muted small">Sem colaborador</span>}
                    </div>
                    {a.reserva && <Link href={`/solicitacoes/${a.reserva.id}`} className="reserva-tag"><Bookmark size={11} /> {a.reserva.numero} · {a.reserva.nomeAdmitido}</Link>}
                    <div className="kcard-foot">
                      {a.garantiaStatus !== 'vigente' && a.garantiaStatus !== 'sem' && a.status !== 'Descartado' ? <GarantiaBadge status={a.garantiaStatus} /> : <span />}
                      {a.diasNoStatus !== null && <span className="muted small"><Clock size={12} /> {a.diasNoStatus}d</span>}
                    </div>
                    {/* Alternativa acessível ao arrastar */}
                    {!a.reserva && <select className="kcard-move" value={a.status} onChange={(e) => mover(a, e.target.value)} aria-label={`Mover ${a.patrimonio} para`}>
                      {COLUNAS.map((c) => <option key={c.status} value={c.status}>{c.status}</option>)}
                    </select>}
                  </article>
                ))}
                {todosCol.length > itens.length && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setLimites((l) => ({ ...l, [col.status]: limite + POR_COLUNA * 2 }))}>Mostrar mais ({todosCol.length - itens.length})</button>}
                {data && todosCol.length === 0 && <div className="board-empty">Solte um card aqui</div>}
              </div>
            </section>
          );
        })}
      </div>

      <Modal aberto={!!pendente} onClose={() => setPendente(null)} titulo="Quem vai usar este ativo?" largura={440}
        subtitulo={pendente && `${pendente.ativo.patrimonio} · ${pendente.ativo.nome}`}
        rodape={<><button type="button" className="btn" onClick={() => setPendente(null)}>Cancelar</button>
          <button type="button" className="btn btn-primary" disabled={!resp.trim()} onClick={() => mover(pendente.ativo, pendente.status, resp.trim())}>Mover para Em uso</button></>}>
        <Field label="Responsável" obrigatorio id="resp-kanban" dica='Ativos "Em uso" precisam de um responsável.'>
          <input id="resp-kanban" value={resp} list="dl-resp-k" onChange={(e) => setResp(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && resp.trim() && mover(pendente.ativo, pendente.status, resp.trim())} />
          <datalist id="dl-resp-k">{meta?.responsaveis.map((r) => <option key={r} value={r} />)}</datalist>
        </Field>
      </Modal>
    </div>
  );
}

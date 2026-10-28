'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Boxes, Plus, Download, Search, LayoutList, LayoutGrid, MoreHorizontal, Eye, Pencil, CalendarPlus, Trash2, ArrowRightLeft, X, ChevronLeft, ChevronRight, FilterX, SlidersHorizontal, Bookmark, FileUp, Building2 } from 'lucide-react';
import { PageHeader, Tabs, Segmented, Menu, MenuItem, StatusBadge, GarantiaBadge, CategoriaIcon, Skeleton, EmptyState, ErroApi } from '@/components/ui';
import { useUI, useToast } from '@/components/providers';
import { useAuth } from '@/components/auth';
import { useApi, useLocalState, useDebounce } from '@/lib/hooks';
import { api } from '@/lib/api';
import { moeda, data as fmtData } from '@/lib/format';

const COLS = [
  { k: 'patrimonio', label: 'Patrimônio' }, { k: 'nome', label: 'Equipamento' }, { k: 'proprietario', label: 'Proprietário' },
  { k: 'status', label: 'Status' }, { k: 'colaborador', label: 'Colaborador' }, { k: 'garantiaAte', label: 'Garantia' }
];
const STATUS = ['Em uso', 'Disponível', 'Em manutenção', 'Descartado'];
const PROPRIETARIOS = ['H&CO', 'H&CO B2Finance'];
const FILTROS_VAZIOS = { categoria: '', departamento: '', garantia: '' };

// Etiqueta "Reservado para SOL-…"
function ReservaTag({ r }) {
  return <Link href={`/solicitacoes/${r.id}`} className="reserva-tag" onClick={(e) => e.stopPropagation()} title={`Reservado para ${r.nomeAdmitido}`}><Bookmark size={11} /> {r.numero}</Link>;
}
const siglaDono = (p) => (p === 'H&CO B2Finance' ? 'B2Finance' : 'H&CO');

function Inventario() {
  const ui = useUI();
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const { pode } = useAuth();
  // Filtros iniciais vindos de links (ex.: alerta "garantias vencidas" → /ativos?garantia=vencida)
  const [aba, setAba] = useState(STATUS.includes(params.get('status')) ? params.get('status') : 'todos');
  const [dono, setDono] = useState(PROPRIETARIOS.includes(params.get('proprietario')) ? params.get('proprietario') : '');
  const [q, setQ] = useState(params.get('q') || '');
  const busca = useDebounce(q.trim(), 250);
  const [filtros, setFiltros] = useState({ ...FILTROS_VAZIOS, garantia: params.get('garantia') || '' });
  const [ordem, setOrdem] = useState({ k: 'patrimonio', dir: 'asc' });
  const [visao, setVisao] = useLocalState('ativotech:visao-ativos', 'tabela');
  const [sel, setSel] = useState([]);
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useLocalState('ativotech:por-pagina', 25);
  const [mostrarFiltros, setMostrarFiltros] = useState(Boolean(params.get('garantia')));

  const consulta = useMemo(() => ({ status: aba === 'todos' ? '' : aba, proprietario: dono, q: busca, ...filtros, ordem: ordem.k, dir: ordem.dir }), [aba, dono, busca, filtros, ordem]);
  const { data: r, erro, carregando, recarregar } = useApi(() => api.ativos.pagina({ ...consulta, pagina, limite: porPagina }), [consulta, pagina, porPagina]);
  const { data: meta } = useApi(() => api.ativos.meta(), []);

  useEffect(() => { setPagina(1); setSel([]); }, [consulta, porPagina]);

  const itens = r?.itens || [];
  const temFiltro = busca || filtros.categoria || filtros.departamento || filtros.garantia || dono;
  const qtdFiltros = [filtros.categoria, filtros.departamento, filtros.garantia].filter(Boolean).length;
  const ordenar = (k) => setOrdem((o) => ({ k, dir: o.k === k && o.dir === 'asc' ? 'desc' : 'asc' }));
  const alternarSel = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const todosPagina = itens.length > 0 && itens.every((a) => sel.includes(a.id));
  const gerenciar = pode('ativos:gerenciar');

  async function selecionarTodosResultados() {
    try {
      const t = await api.ativos.pagina({ ...consulta, pagina: 1, limite: 1, ids: '1' });
      setSel(t.ids);
    } catch (e) { toast({ tipo: 'erro', titulo: 'Não foi possível selecionar', msg: e.message }); }
  }

  async function excluir(a) {
    if (!window.confirm(`Excluir ${a.patrimonio} — ${a.nome}?\nEventos vinculados serão mantidos, mas desvinculados.`)) return;
    try {
      await api.ativos.excluir(a.id);
      toast({ tipo: 'sucesso', titulo: `${a.patrimonio} excluído` });
    } catch (e) { toast({ tipo: 'erro', titulo: 'Erro ao excluir', msg: e.message }); }
  }

  async function lote(acao, valor) {
    if (acao === 'excluir' && !window.confirm(`Excluir ${sel.length} equipamento(s)? Esta ação não pode ser desfeita.`)) return;
    if (acao === 'proprietario' && !window.confirm(`Mudar o proprietário de ${sel.length} equipamento(s) para ${valor}?`)) return;
    try {
      const res = await api.ativos.lote(sel, acao, acao === 'status' ? valor : undefined, acao === 'proprietario' ? { proprietario: valor } : {});
      const pulados = [...(res.bloqueados || []), ...(res.reservados || [])];
      if (acao === 'excluir') toast({ tipo: 'sucesso', titulo: `${res.excluidos} excluído(s)`, msg: pulados.length ? `Reservados não foram excluídos: ${pulados.join(', ')}` : undefined });
      else toast({ tipo: pulados.length ? 'aviso' : 'sucesso', titulo: `${res.alterados} alterado(s)`, msg: pulados.length ? `Não alterados (reservados ou sem colaborador): ${pulados.slice(0, 8).join(', ')}${pulados.length > 8 ? '…' : ''}` : undefined });
      setSel([]);
    } catch (e) { toast({ tipo: 'erro', titulo: 'Erro na ação em lote', msg: e.message }); }
  }

  const exportar = (ids) => {
    api.ativos.exportar(ids ? { ids: ids.join(',') } : consulta).catch((e) => toast({ tipo: 'erro', titulo: 'Erro ao exportar', msg: e.message }));
  };

  const acoesLinha = (a) => (
    <Menu trigger={({ alternar }) => (
      <button type="button" className="icon-btn ghost sm" onClick={(e) => { e.stopPropagation(); alternar(); }} aria-label={`Ações para ${a.patrimonio}`}><MoreHorizontal size={17} /></button>
    )}>
      <MenuItem icone={Eye} onClick={() => router.push(`/ativos/${a.id}`)}>Ver detalhes</MenuItem>
      {gerenciar && <MenuItem icone={Pencil} onClick={() => router.push(`/ativos/${a.id}/editar`)}>Editar</MenuItem>}
      {pode('eventos:gerenciar') && <MenuItem icone={CalendarPlus} onClick={() => ui.abrir('evento', { ativoId: a.id, titulo: `Manutenção — ${a.nome}` })}>Agendar manutenção</MenuItem>}
      {gerenciar && <MenuItem icone={Trash2} perigo onClick={() => excluir(a)}>Excluir</MenuItem>}
    </Menu>
  );
  const colaboradorCelula = (a) => (a.colaborador
    ? <div className="cell-stack"><span>{a.colaborador.nome}</span><small className="muted">{a.colaborador.email}</small></div>
    : a.responsavel ? <span>{a.responsavel}</span> : <span className="muted">—</span>);

  return (
    <div className="page">
      <PageHeader icone={Boxes} titulo="Inventário" subtitulo="Equipamentos com patrimônio, proprietário e colaborador.">
        {pode('importacao:executar') && <Link href="/ativos/importar" className="btn"><FileUp size={16} /> Importar</Link>}
        <button type="button" className="btn" onClick={() => exportar()} title="Exportar o resultado atual (CSV)"><Download size={16} /> <span className="hide-sm">Exportar</span></button>
        {gerenciar && <Link href={`/ativos/novo${dono ? `?proprietario=${encodeURIComponent(dono)}` : ''}`} className="btn btn-primary"><Plus size={16} /> Novo</Link>}
      </PageHeader>

      <ErroApi erro={erro} onRetry={recarregar} />

      <div className="card no-pad">
        <Tabs ativa={aba} onChange={setAba} className="tabs-card" abas={[
          { id: 'todos', label: 'Todos', qtd: r?.contagens.total },
          ...STATUS.map((s) => ({ id: s, label: s, qtd: r?.contagens.porStatus[s] }))
        ]} />

        <div className="toolbar">
          <Segmented label="Proprietário" valor={dono} onChange={setDono} opcoes={[{ id: '', label: 'Todos' }, ...PROPRIETARIOS.map((p) => ({ id: p, label: p }))]} />
          <div className="search-input">
            <Search size={16} aria-hidden="true" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Patrimônio, série, colaborador, e-mail, hostname…" aria-label="Buscar equipamentos" />
          </div>
          <button type="button" className={`btn ${mostrarFiltros || qtdFiltros ? 'btn-soft' : ''}`} onClick={() => setMostrarFiltros((v) => !v)} aria-expanded={mostrarFiltros}>
            <SlidersHorizontal size={16} /> Filtros{qtdFiltros ? ` (${qtdFiltros})` : ''}
          </button>
          <Segmented label="Modo de visualização" valor={visao} onChange={setVisao} opcoes={[
            { id: 'tabela', icone: LayoutList, titulo: 'Tabela' }, { id: 'cards', icone: LayoutGrid, titulo: 'Cartões' }
          ]} />
        </div>

        {mostrarFiltros && (
          <div className="filter-row">
            <select value={filtros.categoria} onChange={(e) => setFiltros((f) => ({ ...f, categoria: e.target.value }))} aria-label="Categoria">
              <option value="">Todas as categorias</option>{meta?.categorias.map((c) => <option key={c}>{c}</option>)}
            </select>
            <select value={filtros.departamento} onChange={(e) => setFiltros((f) => ({ ...f, departamento: e.target.value }))} aria-label="Departamento">
              <option value="">Todos os departamentos</option>{meta?.departamentos.map((c) => <option key={c}>{c}</option>)}
            </select>
            <select value={filtros.garantia} onChange={(e) => setFiltros((f) => ({ ...f, garantia: e.target.value }))} aria-label="Garantia">
              <option value="">Qualquer garantia</option><option value="vigente">Vigente</option><option value="vencendo">Vencendo (60 dias)</option>
              <option value="vencida">Vencida</option><option value="sem">Sem garantia</option>
            </select>
            {temFiltro && <button type="button" className="btn btn-ghost" onClick={() => { setQ(''); setDono(''); setFiltros(FILTROS_VAZIOS); }}><FilterX size={16} /> Limpar</button>}
          </div>
        )}

        {sel.length > 0 && (
          <div className="bulk-bar" role="region" aria-label="Ações em lote">
            <strong>{sel.length} selecionado{sel.length > 1 ? 's' : ''}</strong>
            {todosPagina && r && sel.length < r.total && <button type="button" className="link-btn small" onClick={selecionarTodosResultados}>Selecionar todos os {r.total}</button>}
            {gerenciar && (
              <>
                <Menu align="left" trigger={({ alternar }) => <button type="button" className="btn btn-sm" onClick={alternar}><ArrowRightLeft size={14} /> Status</button>}>
                  {STATUS.map((s) => <MenuItem key={s} onClick={() => lote('status', s)}>{s}</MenuItem>)}
                </Menu>
                <Menu align="left" trigger={({ alternar }) => <button type="button" className="btn btn-sm" onClick={alternar}><Building2 size={14} /> Proprietário</button>}>
                  {PROPRIETARIOS.map((p) => <MenuItem key={p} onClick={() => lote('proprietario', p)}>{p}</MenuItem>)}
                </Menu>
              </>
            )}
            <button type="button" className="btn btn-sm" onClick={() => exportar(sel)}><Download size={14} /> Exportar</button>
            {gerenciar && <button type="button" className="btn btn-sm btn-danger-ghost" onClick={() => lote('excluir')}><Trash2 size={14} /> Excluir</button>}
            <button type="button" className="icon-btn ghost sm" onClick={() => setSel([])} aria-label="Limpar seleção"><X size={16} /></button>
          </div>
        )}

        {carregando && !r ? (
          <div className="pad">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} h={40} style={{ marginBottom: 8 }} />)}</div>
        ) : !itens.length ? (
          <EmptyState icon={Boxes} titulo={temFiltro || aba !== 'todos' ? 'Nenhum equipamento encontrado' : 'Nenhum equipamento cadastrado'}
            texto={temFiltro ? 'Ajuste a busca ou os filtros.' : 'Cadastre o primeiro equipamento ou importe uma planilha.'}>
            {!temFiltro && gerenciar && <div className="row-gap center"><Link href="/ativos/novo" className="btn btn-primary"><Plus size={16} /> Novo</Link>{pode('importacao:executar') && <Link href="/ativos/importar" className="btn"><FileUp size={16} /> Importar planilha</Link>}</div>}
          </EmptyState>
        ) : visao === 'tabela' ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="col-check"><input type="checkbox" checked={todosPagina} aria-label="Selecionar todos da página"
                    onChange={() => setSel((s) => (todosPagina ? s.filter((id) => !itens.some((a) => a.id === id)) : [...new Set([...s, ...itens.map((a) => a.id)])]))} /></th>
                  {COLS.map((c) => (
                    <th key={c.k} aria-sort={ordem.k === c.k ? (ordem.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                      <button type="button" className="th-sort" onClick={() => ordenar(c.k)}>{c.label}<span className="sort-ind">{ordem.k === c.k ? (ordem.dir === 'asc' ? '↑' : '↓') : ''}</span></button>
                    </th>
                  ))}
                  <th className="num"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {itens.map((a) => (
                  <tr key={a.id} className={sel.includes(a.id) ? 'selected' : ''} onClick={() => router.push(`/ativos/${a.id}`)}>
                    <td className="col-check" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel.includes(a.id)} onChange={() => alternarSel(a.id)} aria-label={`Selecionar ${a.patrimonio}`} /></td>
                    <td className="mono nowrap">{a.patrimonio}</td>
                    <td>
                      <div className="cell-asset">
                        <CategoriaIcon categoria={a.categoria} boxed size={15} />
                        <div className="cell-stack"><Link href={`/ativos/${a.id}`} className="row-title" onClick={(e) => e.stopPropagation()}>{a.nome}</Link>
                          <small className="muted">{[a.marca && a.modelo ? `${a.marca} ${a.modelo}` : a.categoria, a.hostname].filter(Boolean).join(' · ')}</small></div>
                      </div>
                    </td>
                    <td><span className={`owner-tag ${a.proprietario === 'H&CO B2Finance' ? 'b2f' : ''}`}>{siglaDono(a.proprietario)}</span></td>
                    <td><div className="cell-stack"><StatusBadge status={a.status} />{a.reserva && <ReservaTag r={a.reserva} />}</div></td>
                    <td>{colaboradorCelula(a)}</td>
                    <td><div className="cell-stack"><GarantiaBadge status={a.garantiaStatus} /><small className="muted">{fmtData(a.garantiaAte)}</small></div></td>
                    <td className="num" onClick={(e) => e.stopPropagation()}>{acoesLinha(a)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="asset-grid">
            {itens.map((a) => (
              <article key={a.id} className={`asset-card ${sel.includes(a.id) ? 'selected' : ''}`}>
                <div className="asset-card-top">
                  <input type="checkbox" checked={sel.includes(a.id)} onChange={() => alternarSel(a.id)} aria-label={`Selecionar ${a.patrimonio}`} />
                  <span className="mono muted small">{a.patrimonio}</span>
                  <span className={`owner-tag ${a.proprietario === 'H&CO B2Finance' ? 'b2f' : ''}`}>{siglaDono(a.proprietario)}</span>
                  {acoesLinha(a)}
                </div>
                <Link href={`/ativos/${a.id}`} className="asset-card-main">
                  <CategoriaIcon categoria={a.categoria} boxed size={20} />
                  <strong>{a.nome}</strong>
                  <small className="muted">{[a.marca, a.modelo].filter(Boolean).join(' · ') || a.categoria}</small>
                </Link>
                <div className="asset-card-meta"><StatusBadge status={a.status} />{a.reserva && <ReservaTag r={a.reserva} />}</div>
                <div className="asset-card-person small">{a.colaborador ? <><strong>{a.colaborador.nome}</strong> <span className="muted">{a.colaborador.email}</span></> : a.responsavel || <span className="muted">Sem colaborador</span>}</div>
              </article>
            ))}
          </div>
        )}

        {r && r.total > 0 && (
          <div className="table-foot">
            <span className="muted small">{(r.pagina - 1) * r.limite + 1}–{Math.min(r.pagina * r.limite, r.total)} de {r.total} · valor atual {moeda(r.valorTotal)}</span>
            <div className="pager">
              <select value={porPagina} onChange={(e) => setPorPagina(Number(e.target.value))} aria-label="Itens por página">
                {[25, 50, 100].map((n) => <option key={n} value={n}>{n} / página</option>)}
              </select>
              <button type="button" className="icon-btn" disabled={r.pagina <= 1} onClick={() => setPagina(r.pagina - 1)} aria-label="Página anterior"><ChevronLeft size={16} /></button>
              <span className="small">{r.pagina} / {r.paginas}</span>
              <button type="button" className="icon-btn" disabled={r.pagina >= r.paginas} onClick={() => setPagina(r.pagina + 1)} aria-label="Próxima página"><ChevronRight size={16} /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<div className="page"><Skeleton h={400} /></div>}><Inventario /></Suspense>;
}

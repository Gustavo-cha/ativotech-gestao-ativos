'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Warehouse, Plus, Search, Laptop, ShieldCheck, ShieldAlert, ClipboardCheck, ScanLine, CheckCircle2, AlertTriangle, Bookmark,
  Package, PackagePlus, PackageMinus, Scale, History, LayoutGrid, Pencil, ArrowDownUp
} from 'lucide-react';
import { PageHeader, Tabs, Badge, Skeleton, EmptyState, ErroApi, Field, Modal, Menu, MenuItem, CategoriaIcon, Switch, Segmented } from '@/components/ui';
import { EstoquePorProprietario, EstoqueIndicadores, EstoqueDistribuicao, SaldoProjetado, AoVivo, CatalogoDisponivel, PROPRIETARIOS } from '@/components/portal/Estoque';
import { SolicitacaoBadge } from '@/components/portal/Status';
import { useToast } from '@/components/providers';
import { useApi, useLocalState } from '@/lib/hooks';
import { api } from '@/lib/api';
import { data as fmtData, dataHora, relativo, numero } from '@/lib/format';
import { SITUACAO_ESTOQUE, TIPO_MOVIMENTACAO } from '@/lib/constants';

const CATEGORIAS_EQUIP = ['Notebook', 'Monitor', 'Smartphone', 'Tablet'];
const CATEGORIAS_ITEM = ['Periférico', 'Acessório', 'Cabo e adaptador', 'Áudio', 'Outro'];
const ABAS = ['visao', 'equipamentos', 'itens', 'reservas', 'movimentacoes', 'conferencia'];

function GestaoEstoque() {
  const params = useSearchParams();
  const [aba, setAba] = useState(ABAS.includes(params.get('aba')) ? params.get('aba') : 'visao');
  const [acao, setAcao] = useState(null);
  // Responde a links como /estoque?aba=itens&acao=entrada mesmo com a página já aberta
  useEffect(() => {
    const a = params.get('aba');
    if (ABAS.includes(a)) setAba(a);
    if (params.get('acao')) setAcao((x) => ({ tipo: params.get('acao'), n: (x?.n || 0) + 1 }));
  }, [params]);
  // Filtro por proprietário: vale para todas as abas (os estoques da H&CO e da H&CO B2Finance nunca se misturam)
  const [dono, setDono] = useLocalState('ativotech:estoque-dono', '');
  const { data: geral, erro, recarregar } = useApi(() => api.estoque.resumo(), []);
  const { data: doDono } = useApi(() => (dono ? api.estoque.resumo({ proprietario: dono }) : Promise.resolve(null)), [dono]);
  const r = dono ? doDono : geral;
  const { data: integ } = useApi(() => api.estoque.consistencia(), []);
  const { data: itens } = useApi(() => api.estoque.itens(dono), [dono]);
  const { data: ativas } = useApi(() => (aba === 'reservas' ? api.solicitacoes.listar({ status: 'ativas', proprietario: dono }) : Promise.resolve(null)), [aba === 'reservas', dono]);

  const reservas = useMemo(() => (ativas || []).filter((s) => s.progressoReserva.alocado > 0 && s.status !== 'Enviado')
    .sort((a, b) => a.dataAdmissao.localeCompare(b.dataAdmissao)), [ativas]);
  const abaixo = (itens || []).filter((i) => i.abaixoMinimo && i.ativo !== false);

  return (
    <div className="page">
      <PageHeader icone={Warehouse} titulo="Estoque" subtitulo="Equipamentos, acessórios, reservas e movimentações — por proprietário.">
        <Link href={`/ativos/novo?categoria=Notebook${dono ? `&proprietario=${encodeURIComponent(dono)}` : ''}`} className="btn"><Laptop size={16} /> <span className="hide-sm">Cadastrar equipamento</span></Link>
        <button type="button" className="btn btn-primary" onClick={() => { setAba('itens'); setAcao((a) => ({ tipo: 'entrada', n: (a?.n || 0) + 1 })); }}><PackagePlus size={16} /> Entrada</button>
      </PageHeader>
      <ErroApi erro={erro} onRetry={recarregar} />

      {integ && !integ.ok && (
        <div className="integrity bad" role="alert">
          <ShieldAlert size={18} />
          <div><strong>Divergências entre reservas e estoque</strong><span className="small">{integ.problemas.join(' · ')}</span></div>
        </div>
      )}

      <div className="section-bar">
        <Segmented label="Proprietário" valor={dono} onChange={setDono} opcoes={[{ id: '', label: 'Todos' }, ...PROPRIETARIOS.map((p) => ({ id: p, label: p }))]} />
        <AoVivo em={geral?.atualizadoEm} />
      </div>

      <div className="card no-pad">
        <Tabs ativa={aba} onChange={setAba} className="tabs-card" abas={[
          { id: 'visao', label: 'Visão geral', icone: LayoutGrid },
          { id: 'equipamentos', label: 'Equipamentos', icone: Laptop },
          { id: 'itens', label: 'Acessórios', icone: Package, qtd: itens?.length },
          { id: 'reservas', label: 'Reservas', icone: Bookmark, qtd: ativas ? reservas.length : undefined },
          { id: 'movimentacoes', label: 'Movimentações', icone: ArrowDownUp },
          { id: 'conferencia', label: 'Conferência', icone: ClipboardCheck }
        ]} />

        {aba === 'visao' && (
          <div className="pad stack-lg">
            <EstoquePorProprietario r={geral} detalhado ativo={dono} onEscolher={setDono} />
            <EstoqueIndicadores r={r} />
            <div className={dono ? 'grid-2' : 'stack-lg'}>
              <section>
                <h3 className="sub-title"><Package size={15} /> Disponível por tipo</h3>
                <CatalogoDisponivel r={r} detalhado proprietario={dono} />
                {abaixo.length > 0 && <p className="inline-warn mt-8"><AlertTriangle size={14} /> {abaixo.length} item(ns) no mínimo ou esgotado(s). <button type="button" className="link-btn" onClick={() => setAba('itens')}>Repor</button></p>}
              </section>
              <section>
                <h3 className="sub-title"><Laptop size={15} /> Notebooks{dono ? ` · ${dono}` : ''}</h3>
                {/* O saldo da fila é sempre por proprietário: somar as duas empresas esconderia a falta de uma delas */}
                {dono ? <SaldoProjetado r={r} /> : (
                  <div className="grid-2">{(geral?.proprietarios || []).map((p) => (
                    <SaldoProjetado key={p.proprietario} r={{ proprietario: p.proprietario, saldoProjetado: p.saldoProjetado, demandaPendente: p.demandaNotebook, disponivel: p.notebooksDisponiveis }} />
                  ))}</div>
                )}
                <div className="mt-12"><EstoqueDistribuicao r={r} /></div>
              </section>
            </div>
          </div>
        )}
        {aba === 'equipamentos' && <Equipamentos dono={dono} />}
        {aba === 'itens' && <Itens itens={itens} acao={acao} dono={dono} />}
        {aba === 'reservas' && <Reservas reservas={ativas ? reservas : null} />}
        {aba === 'movimentacoes' && <Movimentacoes itens={itens} dono={dono} />}
        {aba === 'conferencia' && <Conferencia dono={dono} />}
      </div>
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<div className="page"><Skeleton h={400} /></div>}><GestaoEstoque /></Suspense>;
}

// ---------- Equipamentos com patrimônio ----------
function Equipamentos({ dono }) {
  const [cat, setCat] = useState('Notebook');
  const [situacao, setSituacao] = useState('');
  const [q, setQ] = useState('');
  const { data: lista } = useApi(() => api.estoque.equipamentos({ categoria: cat, proprietario: dono }), [cat, dono]);
  const daCat = (lista || []).filter((n) => !cat || n.categoria === cat);
  const filtrada = useMemo(() => daCat.filter((n) => (!situacao || n.situacao === situacao)
    && (!q || `${n.patrimonio} ${n.nome} ${n.numeroSerie} ${n.configuracao} ${n.localizacao} ${n.responsavel} ${n.colaborador?.email || ''} ${n.reserva?.numero || ''} ${n.reserva?.nomeAdmitido || ''}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => a.patrimonio.localeCompare(b.patrimonio, 'pt-BR', { numeric: true })), [daCat, situacao, q]);
  return (
    <>
      <div className="toolbar">
        <div className="search-input"><Search size={16} /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar patrimônio, série, configuração, local, reserva…" aria-label="Buscar equipamentos" /></div>
        <select value={cat} onChange={(e) => { setCat(e.target.value); setSituacao(''); }} aria-label="Categoria">
          <option value="">Todas as categorias</option>
          {CATEGORIAS_EQUIP.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      <div className="toolbar pt-0">
        <div className="chip-select scroll-x" role="radiogroup" aria-label="Situação">
          <button type="button" role="radio" aria-checked={!situacao} className={`chip ${!situacao ? 'on' : ''}`} onClick={() => setSituacao('')}>Todos <span className="chip-n">{daCat.length}</span></button>
          {Object.entries(SITUACAO_ESTOQUE).map(([k, v]) => (
            <button key={k} type="button" role="radio" aria-checked={situacao === k} className={`chip tone-${v.tom} ${situacao === k ? 'on' : ''}`} onClick={() => { setSituacao(k); }}>
              {v.label} <span className="chip-n">{daCat.filter((n) => n.situacao === k).length}</span>
            </button>
          ))}
        </div>
      </div>
      {!lista ? <div className="pad"><Skeleton h={200} /></div> : filtrada.length === 0 ? <EmptyState icon={Laptop} titulo="Nenhum equipamento encontrado" /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Patrimônio</th><th>Fabricante e modelo</th>{!dono && <th>Proprietário</th>}<th>Configuração</th><th>Situação</th><th>Local</th><th>Vínculo</th></tr></thead>
            <tbody>
              {filtrada.map((n) => (
                <tr key={n.id} className="no-click">
                  <td><div className="cell-asset"><CategoriaIcon categoria={n.categoria} boxed size={15} /><Link href={`/ativos/${n.id}`} className="mono row-title">{n.patrimonio}</Link></div></td>
                  <td><div className="cell-stack"><strong>{n.marca} {n.modelo}</strong><small className="muted mono">{n.numeroSerie || '—'}</small></div></td>
                  {!dono && <td><span className={`owner-tag ${n.proprietario === 'H&CO B2Finance' ? 'b2f' : ''}`}>{n.proprietario === 'H&CO B2Finance' ? 'B2Finance' : 'H&CO'}</span></td>}
                  <td className="small">{n.configuracao || <span className="muted">—</span>}</td>
                  <td><Badge tom={SITUACAO_ESTOQUE[n.situacao].tom} dot>{SITUACAO_ESTOQUE[n.situacao].label}</Badge></td>
                  <td className="small">{n.localizacao || '—'}<small className="muted block">entrada {fmtData(n.dataEntradaEstoque)}</small></td>
                  <td className="small">
                    {n.reserva ? <Link href={`/solicitacoes/${n.reserva.id}`}>{n.reserva.numero} · {n.reserva.nomeAdmitido}</Link>
                      : n.colaborador ? <><strong>{n.colaborador.nome}</strong><small className="muted block">{n.colaborador.email}</small></>
                        : n.entrega ? <><Link href={`/solicitacoes/${n.entrega.id}`}>{n.entrega.numero}</Link> · {n.responsavel}</>
                          : n.responsavel || <span className="muted">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ---------- Itens por quantidade: entradas, saídas e ajustes ----------
function Itens({ itens, acao, dono }) {
  const { toast } = useToast();
  const [q, setQ] = useState('');
  const [mov, setMov] = useState(null); // { item?, tipo }
  const [edit, setEdit] = useState(null); // item ou {} para novo
  const [inativos, setInativos] = useState(false);

  // Atalhos externos ("Registrar entrada" no topo, menu Novo, paleta de comandos) abrem a janela de movimentação
  useEffect(() => {
    if (['entrada', 'saida', 'ajuste'].includes(acao?.tipo)) setMov({ tipo: acao.tipo });
  }, [acao]);

  const lista = (itens || []).filter((i) => (inativos || i.ativo !== false) && (!q || `${i.nome} ${i.categoria} ${i.localizacao}`.toLowerCase().includes(q.toLowerCase())));

  async function salvarMov(d) {
    try {
      const r = await api.estoque.movimentar(d.itemId, d.tipo, d.quantidade, d.motivo);
      toast({ tipo: 'sucesso', titulo: `${TIPO_MOVIMENTACAO[d.tipo].label} registrada`, msg: `${r.item.nome}: saldo ${r.item.quantidade} · ${r.item.disponivel} disponível(is)` });
      setMov(null);
      return true;
    } catch (e) {
      toast({ tipo: 'erro', titulo: 'Não foi possível registrar', msg: e.message });
      return e.campos || {};
    }
  }
  async function salvarItem(d) {
    try {
      const r = d.id ? await api.estoque.atualizarItem(d.id, d) : await api.estoque.criarItem(d);
      toast({ tipo: 'sucesso', titulo: d.id ? 'Item atualizado' : `${r.nome} cadastrado` });
      setEdit(null);
      return true;
    } catch (e) {
      toast({ tipo: 'erro', titulo: 'Não foi possível salvar', msg: e.message });
      return e.campos || {};
    }
  }

  return (
    <>
      <div className="toolbar">
        <div className="search-input"><Search size={16} /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar acessório, categoria ou local…" aria-label="Buscar itens" /></div>
        <label className="switch-line small"><Switch checked={inativos} onChange={setInativos} label="Mostrar inativos" /> Inativos</label>
        <button type="button" className="btn" onClick={() => setMov({ tipo: 'entrada' })}><PackagePlus size={16} /> Entrada</button>
        <button type="button" className="btn" onClick={() => setMov({ tipo: 'saida' })}><PackageMinus size={16} /> Saída</button>
        <button type="button" className="btn btn-primary" onClick={() => setEdit({})}><Plus size={16} /> Novo item</button>
      </div>
      {!itens ? <div className="pad"><Skeleton h={200} /></div> : lista.length === 0 ? <EmptyState icon={Package} titulo="Nenhum item cadastrado" texto="Cadastre mouses, teclados, headsets e outros itens controlados por quantidade." /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Item</th>{!dono && <th>Proprietário</th>}<th>Local</th><th className="num">Em estoque</th><th className="num">Reservado</th><th className="num">Disponível</th><th className="num">Mínimo</th><th>Situação</th><th /></tr></thead>
            <tbody>
              {lista.map((i) => (
                <tr key={i.id} className={`no-click ${i.ativo === false ? 'row-off' : ''}`}>
                  <td><div className="cell-asset"><CategoriaIcon categoria={i.categoria} boxed size={15} /><div className="cell-stack"><strong>{i.nome}</strong><small className="muted">{i.categoria}{i.ativo === false ? ' · fora do catálogo' : ''}</small></div></div></td>
                  {!dono && <td><span className={`owner-tag ${i.proprietario === 'H&CO B2Finance' ? 'b2f' : ''}`}>{i.proprietario === 'H&CO B2Finance' ? 'B2Finance' : 'H&CO'}</span></td>}
                  <td className="small">{i.localizacao || <span className="muted">—</span>}</td>
                  <td className="num">{numero(i.quantidade)}</td>
                  <td className="num">{i.reservado ? <Badge tom="cyan">{i.reservado}</Badge> : <span className="muted">0</span>}</td>
                  <td className="num"><strong className={i.disponivel === 0 ? 'txt-red' : i.abaixoMinimo ? 'txt-amber' : ''}>{numero(i.disponivel)}</strong> <small className="muted">{i.unidade}</small></td>
                  <td className="num muted">{i.minimo || '—'}</td>
                  <td>{i.disponivel === 0 ? <Badge tom="red">Esgotado</Badge> : i.abaixoMinimo ? <Badge tom="amber">Repor</Badge> : <Badge tom="green">OK</Badge>}</td>
                  <td className="num">
                    <div className="row-gap end">
                      <button type="button" className="btn btn-sm btn-soft" onClick={() => setMov({ item: i, tipo: 'entrada' })} aria-label={`Entrada de ${i.nome}`}><PackagePlus size={14} /> Entrada</button>
                      <Menu trigger={({ alternar }) => <button type="button" className="icon-btn ghost" onClick={alternar} aria-label={`Mais ações para ${i.nome}`}>⋯</button>}>
                        <MenuItem icone={PackageMinus} onClick={() => setMov({ item: i, tipo: 'saida' })}>Registrar saída</MenuItem>
                        <MenuItem icone={Scale} onClick={() => setMov({ item: i, tipo: 'ajuste' })}>Ajuste de inventário</MenuItem>
                        <MenuItem icone={Pencil} onClick={() => setEdit(i)}>Editar item</MenuItem>
                      </Menu>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <MovModal aberto={Boolean(mov)} inicial={mov} itens={(itens || []).filter((i) => i.ativo !== false)} fechar={() => setMov(null)} salvar={salvarMov} />
      <ItemModal item={edit} fechar={() => setEdit(null)} salvar={salvarItem} dono={dono} />
    </>
  );
}

function MovModal({ aberto, inicial, itens, fechar, salvar }) {
  const [d, setD] = useState({ tipo: 'entrada', itemId: '', quantidade: '', motivo: '' });
  const [erros, setErros] = useState({});
  useEffect(() => {
    if (aberto) { setD({ tipo: inicial?.tipo || 'entrada', itemId: inicial?.item?.id || '', quantidade: '', motivo: '' }); setErros({}); }
  }, [aberto, inicial]);
  const item = itens.find((i) => i.id === d.itemId);
  const q = Math.floor(Number(d.quantidade));
  const novoSaldo = item && q >= 0 ? (d.tipo === 'entrada' ? item.quantidade + q : d.tipo === 'saida' ? item.quantidade - q : q) : null;
  const info = TIPO_MOVIMENTACAO[d.tipo];
  async function enviar() {
    const e = {};
    if (!d.itemId) e.itemId = 'Escolha o item.';
    if (!(q >= (d.tipo === 'ajuste' ? 0 : 1))) e.quantidade = 'Quantidade inválida.';
    else if (d.tipo === 'saida' && item && q > item.disponivel) e.quantidade = `Só há ${item.disponivel} livre(s); ${item.reservado} reservado(s) para solicitações.`;
    else if (d.tipo === 'ajuste' && item && q < item.reservado) e.quantidade = `O saldo não pode ficar abaixo das ${item.reservado} unidade(s) reservadas.`;
    if (d.tipo !== 'entrada' && d.motivo.trim().length < 3) e.motivo = 'Informe o motivo.';
    if (Object.keys(e).length) { setErros(e); return; }
    const r = await salvar({ ...d, quantidade: q });
    if (r !== true) setErros(r);
  }
  return (
    <Modal aberto={aberto} onClose={fechar} titulo="Movimentar estoque" subtitulo="Entradas somam, saídas subtraem e o ajuste define o saldo contado." icone={ArrowDownUp} largura={560}
      rodape={<><button type="button" className="btn" onClick={fechar}>Cancelar</button><button type="button" className="btn btn-primary" onClick={enviar}>Registrar {info?.label.toLowerCase()}</button></>}>
      <div className="segmented full mb-12" role="radiogroup" aria-label="Tipo de movimentação">
        {['entrada', 'saida', 'ajuste'].map((t) => {
          const I = t === 'entrada' ? PackagePlus : t === 'saida' ? PackageMinus : Scale;
          return <button key={t} type="button" role="radio" aria-checked={d.tipo === t} className={d.tipo === t ? 'on' : ''} onClick={() => { setD((x) => ({ ...x, tipo: t })); }}><I size={15} /> <span>{TIPO_MOVIMENTACAO[t].label}</span></button>;
        })}
      </div>
      <div className="form-grid">
        <Field label="Item" obrigatorio erro={erros.itemId} wide id="mov-item">
          <select id="mov-item" value={d.itemId} onChange={(e) => setD((x) => ({ ...x, itemId: e.target.value }))} aria-invalid={!!erros.itemId}>
            <option value="">Selecione</option>
            {itens.map((i) => <option key={i.id} value={i.id}>{i.nome} ({i.proprietario}) — {i.disponivel} livre(s) de {i.quantidade}</option>)}
          </select>
        </Field>
        <Field label={d.tipo === 'ajuste' ? 'Saldo contado' : 'Quantidade'} obrigatorio erro={erros.quantidade} id="mov-qtd">
          <input id="mov-qtd" type="number" min={d.tipo === 'ajuste' ? 0 : 1} inputMode="numeric" value={d.quantidade} onChange={(e) => setD((x) => ({ ...x, quantidade: e.target.value }))} aria-invalid={!!erros.quantidade} />
        </Field>
        <Field label="Saldo após" id="mov-saldo">
          <div className={`saldo-preview ${novoSaldo !== null && item && novoSaldo < item.reservado ? 'txt-red' : ''}`}>{item ? `${item.quantidade} → ${novoSaldo ?? '…'} ${item.unidade}` : '—'}</div>
        </Field>
        <Field label={d.tipo === 'entrada' ? 'Origem / nota fiscal' : 'Motivo'} obrigatorio={d.tipo !== 'entrada'} erro={erros.motivo} wide id="mov-motivo"
          dica={d.tipo === 'entrada' ? 'Opcional — ex.: NF 12345, fornecedor' : d.tipo === 'saida' ? 'Ex.: defeito, perda, doação, uso interno' : 'Ex.: inventário mensal'}>
          <input id="mov-motivo" value={d.motivo} maxLength={200} onChange={(e) => setD((x) => ({ ...x, motivo: e.target.value }))} aria-invalid={!!erros.motivo} />
        </Field>
      </div>
      {item?.reservado > 0 && <p className="muted small"><Bookmark size={12} /> {item.reservado} unidade(s) reservada(s) para solicitações — saem do estoque no envio.</p>}
    </Modal>
  );
}

function ItemModal({ item, fechar, salvar, dono }) {
  const aberto = Boolean(item);
  const [d, setD] = useState({});
  const [erros, setErros] = useState({});
  useEffect(() => {
    if (item) { setD({ nome: '', categoria: 'Periférico', unidade: 'un', localizacao: 'Almoxarifado TI', minimo: 0, quantidade: 0, descricao: '', ativo: true, proprietario: dono || '', ...item }); setErros({}); }
  }, [item, dono]);
  const set = (k) => (e) => setD((x) => ({ ...x, [k]: e?.target ? e.target.value : e }));
  async function enviar() {
    const r = await salvar(d);
    if (r !== true) setErros(r);
  }
  return (
    <Modal aberto={aberto} onClose={fechar} titulo={item?.id ? `Editar ${item.nome}` : 'Novo item de estoque'} subtitulo="Itens controlados por quantidade (sem patrimônio individual)." icone={Package} largura={600}
      rodape={<><button type="button" className="btn" onClick={fechar}>Cancelar</button><button type="button" className="btn btn-primary" onClick={enviar}>Salvar</button></>}>
      <div className="form-grid">
        <Field label="Proprietário" obrigatorio erro={erros.proprietario} wide id="it-dono" dica={item?.reservado ? 'Há unidades reservadas: o proprietário não pode ser trocado agora.' : undefined}>
          <Segmented label="Proprietário" valor={d.proprietario || ''} onChange={(v) => !item?.reservado && setD((x) => ({ ...x, proprietario: v }))} opcoes={PROPRIETARIOS.map((p) => ({ id: p, label: p }))} />
        </Field>
        <Field label="Nome" obrigatorio erro={erros.nome} wide id="it-nome"><input id="it-nome" value={d.nome || ''} onChange={set('nome')} placeholder="Ex.: Mouse sem fio" aria-invalid={!!erros.nome} /></Field>
        <Field label="Categoria" erro={erros.categoria} id="it-cat">
          <select id="it-cat" value={d.categoria || ''} onChange={set('categoria')}>{CATEGORIAS_ITEM.map((c) => <option key={c}>{c}</option>)}</select>
        </Field>
        <Field label="Unidade" id="it-un"><input id="it-un" value={d.unidade || ''} onChange={set('unidade')} placeholder="un, par, kit…" /></Field>
        <Field label="Local" id="it-local"><input id="it-local" value={d.localizacao || ''} onChange={set('localizacao')} /></Field>
        <Field label="Estoque mínimo" erro={erros.minimo} id="it-min" dica="Alerta quando o disponível chegar a este número"><input id="it-min" type="number" min={0} value={d.minimo ?? 0} onChange={set('minimo')} /></Field>
        {!item?.id && <Field label="Saldo inicial" erro={erros.quantidade} id="it-qtd" dica="Gera uma entrada no histórico"><input id="it-qtd" type="number" min={0} value={d.quantidade ?? 0} onChange={set('quantidade')} /></Field>}
        {item?.id && (
          <Field label="Disponível para solicitação" id="it-ativo" dica="Desligado: o item some do formulário do RH">
            <Switch checked={d.ativo !== false} onChange={(v) => setD((x) => ({ ...x, ativo: v }))} label="Disponível no catálogo" id="it-ativo" />
          </Field>
        )}
      </div>
    </Modal>
  );
}

// ---------- Reservas para admissões ----------
function Reservas({ reservas }) {
  if (!reservas) return <div className="pad"><Skeleton h={160} /></div>;
  if (!reservas.length) return <EmptyState icon={Bookmark} titulo="Nenhuma reserva ativa" texto="Itens reservados para solicitações em andamento aparecem aqui." />;
  return (
    <ul className="row-list">
      {reservas.map((s) => {
        const dias = s.diasParaAdmissao;
        const reservados = s.itens.flatMap((l) => (l.tipo === 'ativo' ? (l.equipamentos || []).map((e) => `${e.patrimonio} (${l.categoria})`) : l.reservado ? [`${l.nome} ×${l.reservado}`] : []));
        return (
          <li key={s.id} className="reserva-row">
            <span className={`date-chip tone-${dias <= 3 ? 'red' : dias <= 7 ? 'amber' : 'cyan'}`}><strong>{s.dataAdmissao.slice(8, 10)}</strong><small>{s.dataAdmissao.slice(5, 7)}/{s.dataAdmissao.slice(2, 4)}</small></span>
            <span className="grow">
              <strong><Link href={`/solicitacoes/${s.id}`}>{s.numero} · {s.nomeAdmitido}</Link></strong>
              <small className="muted">{reservados.join(' · ')}</small>
            </span>
            <span className="small muted nowrap">{s.progressoReserva.alocado}/{s.progressoReserva.total}</span>
            <SolicitacaoBadge status={s.status} />
            <Link href={`/solicitacoes/${s.id}`} className="btn btn-sm btn-ghost">Gerenciar</Link>
          </li>
        );
      })}
    </ul>
  );
}

// ---------- Histórico de movimentações ----------
function Movimentacoes({ itens, dono }) {
  const [tipo, setTipo] = useState('');
  const [itemId, setItemId] = useState('');
  const { data, erro } = useApi(() => api.estoque.movimentacoes({ tipo, itemId, proprietario: dono, limite: 200 }), [tipo, itemId, dono]);
  return (
    <>
      <div className="toolbar">
        <div className="chip-select scroll-x" role="radiogroup" aria-label="Tipo">
          <button type="button" role="radio" aria-checked={!tipo} className={`chip ${!tipo ? 'on' : ''}`} onClick={() => setTipo('')}>Todas</button>
          {Object.entries(TIPO_MOVIMENTACAO).map(([k, v]) => <button key={k} type="button" role="radio" aria-checked={tipo === k} className={`chip tone-${v.tom} ${tipo === k ? 'on' : ''}`} onClick={() => { setTipo(k); }}>{v.label}</button>)}
        </div>
        <select value={itemId} onChange={(e) => setItemId(e.target.value)} aria-label="Item">
          <option value="">Todos os itens</option>
          {(itens || []).map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
        </select>
      </div>
      <ErroApi erro={erro} />
      {!data ? <div className="pad"><Skeleton h={200} /></div> : data.length === 0 ? <EmptyState icon={History} titulo="Nenhuma movimentação" /> : (
        <div className="table-wrap">
          <table className="table compact">
            <thead><tr><th>Quando</th><th>Tipo</th><th>Item / equipamento</th><th className="num">Qtd.</th><th className="num">Saldo após</th><th>Solicitação</th><th>Motivo</th><th>Por</th></tr></thead>
            <tbody>
              {data.map((m) => {
                const t = TIPO_MOVIMENTACAO[m.tipo] || { label: m.tipo, tom: 'slate', sinal: '' };
                return (
                  <tr key={m.id} className="no-click">
                    <td className="small nowrap" title={dataHora(m.em)}>{relativo(m.em)}</td>
                    <td><Badge tom={t.tom}>{t.label}</Badge></td>
                    <td className="small">{m.ativoId ? <Link href={`/ativos/${m.ativoId}`}>{m.nome}</Link> : m.nome}</td>
                    <td className="num mono">{m.alvo === 'item' ? `${m.tipo === 'ajuste' ? (m.quantidade >= 0 ? '+' : '') : t.sinal}${m.tipo === 'ajuste' ? m.quantidade : Math.abs(m.quantidade)}` : '1'}</td>
                    <td className="num">{m.saldoApos ?? <span className="muted">—</span>}</td>
                    <td className="small">{m.solicitacaoId ? <Link href={`/solicitacoes/${m.solicitacaoId}`} className="mono">{m.numero}</Link> : <span className="muted">—</span>}</td>
                    <td className="small">{m.motivo || <span className="muted">—</span>}</td>
                    <td className="small nowrap">{m.usuario}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ---------- Conferência física: compara o que está na prateleira com o sistema ----------
function Conferencia({ dono }) {
  const { toast } = useToast();
  const [texto, setTexto] = useState('');
  const [obs, setObs] = useState('');
  const [resultado, setResultado] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const { data: historico } = useApi(() => api.estoque.conferencias(), []);

  async function conferir(e) {
    e.preventDefault();
    setEnviando(true);
    try {
      const r = await api.estoque.conferir(texto, obs, dono);
      setResultado(r);
      toast({ tipo: r.ok ? 'sucesso' : 'aviso', titulo: r.ok ? 'Estoque físico confere com o sistema' : 'Divergências encontradas' });
    } catch (err) { toast({ tipo: 'erro', titulo: 'Erro na conferência', msg: err.message }); }
    setEnviando(false);
  }

  return (
    <div className="pad conf-grid">
      <form onSubmit={conferir} className="conf-form">
        <h3 className="section-title"><ScanLine size={17} /> Nova conferência</h3>
        <p className="muted small">Digite ou escaneie as etiquetas de patrimônio encontradas no almoxarifado{dono ? <> da <strong>{dono}</strong></> : ''} (uma por linha, espaço ou vírgula).{!dono && ' Escolha um proprietário acima para conferir só o almoxarifado dele.'}</p>
        <Field label="Patrimônios encontrados" id="conf-pats">
          <textarea id="conf-pats" rows={6} className="mono" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={'TI-0019\nTI-0020'} />
        </Field>
        <Field label="Observação" id="conf-obs"><input id="conf-obs" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: inventário mensal — matriz" /></Field>
        <button type="submit" className="btn btn-primary mt-8" disabled={!texto.trim() || enviando}><ClipboardCheck size={16} /> Conferir</button>
      </form>

      <div>
        {resultado && (
          <div className={`conf-result ${resultado.ok ? 'ok' : 'bad'}`}>
            <h3>{resultado.ok ? <><CheckCircle2 size={18} /> Sem divergências</> : <><AlertTriangle size={18} /> {resultado.faltando.length + resultado.foraDoEstoque.length + resultado.desconhecidos.length} divergência(s)</>}</h3>
            <p className="small">{resultado.conferidos.length} de {resultado.esperados} equipamentos esperados foram encontrados.</p>
            {resultado.faltando.length > 0 && <><strong className="small">Não encontrados na prateleira</strong><ul className="conf-list">{resultado.faltando.map((f) => <li key={f.patrimonio}><span className="mono">{f.patrimonio}</span> · {f.nome} · {SITUACAO_ESTOQUE[f.situacao].label} · {f.localizacao}</li>)}</ul></>}
            {resultado.foraDoEstoque.length > 0 && <><strong className="small">Encontrados, mas o sistema diz que não estão no estoque</strong><ul className="conf-list">{resultado.foraDoEstoque.map((f) => <li key={f.patrimonio}><span className="mono">{f.patrimonio}</span> · {SITUACAO_ESTOQUE[f.situacao].label}{f.responsavel ? ` com ${f.responsavel}` : ''}</li>)}</ul></>}
            {resultado.desconhecidos.length > 0 && <><strong className="small">Patrimônios não cadastrados</strong><ul className="conf-list">{resultado.desconhecidos.map((p) => <li key={p} className="mono">{p}</li>)}</ul></>}
          </div>
        )}
        <h3 className="section-title mt-16"><ClipboardCheck size={17} /> Últimas conferências</h3>
        {!historico?.length ? <p className="muted small">Nenhuma conferência registrada.</p> : (
          <ul className="audit-list">
            {historico.slice(0, 8).map((c) => (
              <li key={c.id}>
                <Badge tom={c.ok ? 'green' : 'amber'}>{c.ok ? 'OK' : 'Divergência'}</Badge> <strong>{c.por}</strong> <span className="muted">· {relativo(c.em)}</span>
                <small>{c.conferidos.length}/{c.esperados} conferidos{c.faltando.length ? ` · ${c.faltando.length} faltando` : ''}{c.foraDoEstoque.length ? ` · ${c.foraDoEstoque.length} fora do estoque` : ''}{c.observacao ? ` · ${c.observacao}` : ''}</small>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

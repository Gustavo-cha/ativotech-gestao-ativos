'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, FileUp, UploadCloud, FileSpreadsheet, Columns3, ListChecks, CheckCircle2, AlertTriangle, XCircle, Download, RotateCcw,
  History, ChevronLeft, ChevronRight, Loader2, Pencil, Info, Undo2, Boxes
} from 'lucide-react';
import { PageHeader, Badge, Field, Modal, Segmented, Switch, EmptyState, Skeleton } from '@/components/ui';
import { useToast } from '@/components/providers';
import { api } from '@/lib/api';
import { relativo, dataHora } from '@/lib/format';

const CHAVE_SESSAO = 'ativotech:importacao';
const ETAPAS = [
  { id: 'arquivo', label: 'Arquivo', icone: FileUp },
  { id: 'colunas', label: 'Colunas', icone: Columns3 },
  { id: 'revisao', label: 'Revisão', icone: ListChecks },
  { id: 'fim', label: 'Concluído', icone: CheckCircle2 }
];
const FILTROS = [
  { id: 'todos', label: 'Todas', k: 'linhas' }, { id: 'criar', label: 'Novos', k: 'criar', tom: 'green' },
  { id: 'alterar', label: 'Atualizar/completar', k: null, tom: 'blue' }, { id: 'existentes', label: 'Já cadastrados', k: 'existentes', tom: 'slate' },
  { id: 'erros', label: 'Com erro', k: 'erros', tom: 'red' }, { id: 'avisos', label: 'Com aviso', k: 'comAvisos', tom: 'amber' }
];
const ACAO = { criar: { txt: 'Novo', tom: 'green' }, atualizar: { txt: 'Atualizar', tom: 'blue' }, complementar: { txt: 'Completar', tom: 'cyan' }, ignorar: { txt: 'Ignorar', tom: 'slate' } };
const EDITAVEIS = [['patrimonio', 'Patrimônio'], ['numeroSerie', 'Número de série'], ['nome', 'Nome'], ['categoria', 'Categoria'], ['status', 'Status'],
  ['proprietario', 'Proprietário'], ['colaboradorEmail', 'E-mail do colaborador'], ['responsavel', 'Colaborador / responsável'], ['localizacao', 'Localização']];

const guardar = (id) => { try { if (id) sessionStorage.setItem(CHAVE_SESSAO, id); else sessionStorage.removeItem(CHAVE_SESSAO); } catch { /* sem storage */ } };
const lerGuardada = () => { try { return sessionStorage.getItem(CHAVE_SESSAO); } catch { return null; } };

export default function Importar() {
  const { toast } = useToast();
  const [etapa, setEtapa] = useState('arquivo');
  const [p, setP] = useState(null); // prévia atual
  const [filtro, setFiltro] = useState('todos');
  const [ocupado, setOcupado] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [linhaAberta, setLinhaAberta] = useState(null);
  const [confirmar, setConfirmar] = useState(false);
  const [historico, setHistorico] = useState(null);

  const carregarHistorico = useCallback(() => api.importacao.historico().then(setHistorico).catch(() => setHistorico([])), []);
  useEffect(() => { carregarHistorico(); }, [carregarHistorico]);

  // Retoma a importação em andamento (ex.: página recarregada)
  useEffect(() => {
    const id = lerGuardada();
    if (!id) return;
    api.importacao.previa(id).then((r) => { setP(r); setEtapa('colunas'); }).catch(() => guardar(null));
  }, []);

  const falhou = (titulo, e) => toast({ tipo: 'erro', titulo, msg: e.message });

  async function enviar(arquivo) {
    if (!arquivo) return;
    if (!/\.(csv|xlsx|xlsm|txt)$/i.test(arquivo.name)) { toast({ tipo: 'erro', titulo: 'Formato não suportado', msg: 'Envie um arquivo .csv ou .xlsx.' }); return; }
    if (arquivo.size > 12 * 1024 * 1024) { toast({ tipo: 'erro', titulo: 'Arquivo grande demais', msg: 'O limite é 12 MB. Divida a planilha.' }); return; }
    setOcupado(true);
    try {
      const r = await api.importacao.analisar(arquivo);
      setP(r);
      guardar(r.id);
      setFiltro('todos');
      setEtapa('colunas');
    } catch (e) { falhou('Não foi possível ler o arquivo', e); }
    setOcupado(false);
  }

  async function configurar(mudanca) {
    setOcupado(true);
    try { setP(await api.importacao.configurar(p.id, mudanca, { filtro, pagina: p.pagina })); } catch (e) { falhou('Não foi possível aplicar', e); }
    setOcupado(false);
  }

  async function verPagina(f, pagina = 1) {
    setFiltro(f);
    try { setP(await api.importacao.previa(p.id, { filtro: f, pagina })); } catch (e) { falhou('Não foi possível carregar', e); }
  }

  async function salvarLinha(n, d) {
    try {
      const r = await api.importacao.linha(p.id, n, d);
      // Atualiza a linha e os totais sem recarregar a página inteira da prévia
      setP((x) => ({ ...x, totais: r.totais, faltando: r.faltando, versao: r.versao, linhas: x.linhas.map((l) => (l.n === n ? r.linha : l)) }));
      return r.linha;
    } catch (e) { falhou('Não foi possível salvar a correção', e); return null; }
  }

  async function importar() {
    setOcupado(true);
    try {
      const r = await api.importacao.confirmar(p.id, p.versao);
      setResultado(r);
      setConfirmar(false);
      guardar(null);
      setEtapa('fim');
      carregarHistorico();
      toast({ tipo: 'sucesso', titulo: 'Importação concluída' });
    } catch (e) {
      falhou('Importação não realizada', e);
      if (e.status === 409) verPagina(filtro, p.pagina);
    }
    setOcupado(false);
  }

  function recomecar() {
    if (p && etapa !== 'fim') api.importacao.descartar(p.id).catch(() => {});
    guardar(null);
    setP(null);
    setResultado(null);
    setEtapa('arquivo');
  }

  async function desfazer(reg) {
    if (!window.confirm(`Desfazer a importação de “${reg.arquivo}”?\n\nOs equipamentos criados serão removidos e os campos alterados voltam ao valor anterior — exceto o que foi modificado depois da importação.`)) return;
    try {
      const r = await api.importacao.desfazer(reg.id);
      toast({ tipo: r.mantidos.length ? 'aviso' : 'sucesso', titulo: 'Importação desfeita', msg: `${r.removidos} removido(s), ${r.restaurados} restaurado(s)${r.mantidos.length ? `. ${r.mantidos.length} item(ns) mantido(s) por terem mudado depois.` : '.'}` });
      carregarHistorico();
      if (resultado?.id === reg.id) setResultado((x) => ({ ...x, desfeitaEm: new Date().toISOString() }));
    } catch (e) { falhou('Não foi possível desfazer', e); }
  }

  const i = ETAPAS.findIndex((e) => e.id === etapa);
  const t = p?.totais;
  const aImportar = t ? t.criar + t.atualizar + t.complementar : 0;

  return (
    <div className="page">
      <Link href="/ativos" className="back-link"><ArrowLeft size={15} /> Inventário</Link>
      <PageHeader icone={FileUp} titulo="Importar equipamentos" subtitulo="CSV ou Excel (.xlsx) exportado do Desk Manager, SharePoint ou outra planilha. Nada é gravado antes da sua confirmação." />

      <ol className="steps" aria-label="Etapas da importação">
        {ETAPAS.map((e, k) => {
          const I = e.icone;
          return <li key={e.id} className={k < i ? 'done' : k === i ? 'on' : ''} aria-current={k === i ? 'step' : undefined}><span><I size={15} /></span>{e.label}</li>;
        })}
      </ol>

      {etapa === 'arquivo' && <Arquivo enviar={enviar} ocupado={ocupado} />}

      {etapa === 'colunas' && p && (
        <section className="card no-pad">
          <div className="card-head pad-x pt-16">
            <h2><FileSpreadsheet size={17} /> {p.arquivo}</h2>
            <span className="muted small">{p.formato}{p.aba ? ` · aba “${p.aba}”` : ''}{p.separador ? ` · separador ${p.separador}` : ''} · {t.linhas} linha(s)</span>
          </div>
          <div className="imp-grid pad">
            <div>
              <h3 className="sub-title">Correspondência das colunas</h3>
              <p className="muted small mb-8">Reconhecemos as colunas automaticamente. Ajuste o que não estiver certo — colunas sem campo são ignoradas.</p>
              <div className="table-wrap">
                <table className="table compact">
                  <thead><tr><th>Coluna no arquivo</th><th>Exemplos</th><th>Campo no Ativos Tech</th></tr></thead>
                  <tbody>
                    {p.colunas.map((c) => (
                      <tr key={c.nome} className="no-click">
                        <td><strong>{c.nome}</strong>{c.confianca && c.campo && <small className={`conf conf-${c.confianca}`}>{c.confianca === 'alta' ? 'reconhecida' : 'sugestão'}</small>}</td>
                        <td className="small muted ellipsis" title={c.exemplos.join(' · ')}>{c.exemplos.join(' · ') || '—'}</td>
                        <td>
                          <select value={c.campo} aria-label={`Campo para a coluna ${c.nome}`} disabled={ocupado}
                            onChange={(e) => configurar({ mapeamento: Object.fromEntries(p.colunas.map((x) => [x.nome, x.nome === c.nome ? e.target.value : (x.campo === e.target.value ? '' : x.campo)])) })}>
                            <option value="">— ignorar —</option>
                            {p.campos.map((f) => <option key={f.id} value={f.id}>{f.label}{f.obrigatorio ? ' *' : ''}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <aside className="imp-opcoes">
              <h3 className="sub-title">Regras da importação</h3>
              <Field label="Proprietário padrão" obrigatorio={!p.colunas.some((c) => c.campo === 'proprietario')} wide dica="Usado nas linhas sem proprietário (ou quando o arquivo não tem essa coluna).">
                <Segmented label="Proprietário padrão" valor={p.opcoes.proprietarioPadrao} onChange={(v) => configurar({ opcoes: { proprietarioPadrao: v } })}
                  opcoes={[{ id: 'H&CO', label: 'H&CO' }, { id: 'H&CO B2Finance', label: 'H&CO B2Finance' }]} />
              </Field>
              <Field label="Equipamentos que já existem" wide dica="Comparados por patrimônio e número de série. Valores vazios da planilha nunca apagam dados.">
                <select value={p.opcoes.decisaoDuplicados} onChange={(e) => configurar({ opcoes: { decisaoDuplicados: e.target.value } })} disabled={ocupado}>
                  <option value="ignorar">Ignorar (manter o cadastro como está)</option>
                  <option value="complementar">Completar só os campos vazios</option>
                  <option value="atualizar">Atualizar com os valores da planilha</option>
                </select>
              </Field>
              <Field label="Status quando vazio" wide dica="Com colaborador informado, o status fica “Em uso”.">
                <select value={p.opcoes.statusPadrao} onChange={(e) => configurar({ opcoes: { statusPadrao: e.target.value } })} disabled={ocupado}>
                  {p.status.map((s) => <option key={s}>{s}</option>)}
                </select>
              </Field>
              <label className="switch-line small"><Switch checked={p.opcoes.semPatrimonio === 'serie'} onChange={(v) => configurar({ opcoes: { semPatrimonio: v ? 'serie' : 'erro' } })} label="Usar número de série como patrimônio" /> Sem patrimônio: usar o número de série</label>
              <label className="switch-line small"><Switch checked={p.opcoes.criarColaboradores} onChange={(v) => configurar({ opcoes: { criarColaboradores: v } })} label="Cadastrar colaboradores pelo e-mail" /> Cadastrar colaboradores pelo e-mail corporativo</label>
            </aside>
          </div>
          {p.faltando.length > 0 && <p className="inline-warn mx-16"><AlertTriangle size={14} /> Falta definir: {p.faltando.join(' · ')}.</p>}
          <div className="card-foot">
            <button type="button" className="btn btn-ghost" onClick={recomecar}>Trocar arquivo</button>
            <span className="grow" />
            {ocupado && <Loader2 size={16} className="spin" aria-label="Aplicando" />}
            <button type="button" className="btn btn-primary" disabled={ocupado} onClick={() => { setEtapa('revisao'); verPagina('todos'); }}>Revisar {t.linhas} linha(s) <ChevronRight size={16} /></button>
          </div>
        </section>
      )}

      {etapa === 'revisao' && p && (
        <section className="card no-pad">
          <div className="imp-resumo">
            <Resumo n={t.criar} label="novos" tom="green" />
            <Resumo n={t.atualizar + t.complementar} label="a atualizar" tom="blue" />
            <Resumo n={t.ignorar - t.erros} label="ignorados" tom="slate" />
            <Resumo n={t.erros} label="com erro" tom="red" />
            {t.colaboradoresNovos > 0 && <Resumo n={t.colaboradoresNovos} label="colaboradores novos" tom="violet" />}
          </div>
          <div className="toolbar">
            <div className="chip-select scroll-x" role="radiogroup" aria-label="Filtrar linhas">
              {FILTROS.map((f) => {
                const n = f.k ? t[f.k] : t.atualizar + t.complementar;
                return <button key={f.id} type="button" role="radio" aria-checked={filtro === f.id} className={`chip ${f.tom ? `tone-${f.tom}` : ''} ${filtro === f.id ? 'on' : ''}`} onClick={() => verPagina(f.id)}>{f.label} <span className="chip-n">{n}</span></button>;
              })}
            </div>
            <button type="button" className="btn btn-sm" onClick={() => api.importacao.relatorio(p.id).catch((e) => falhou('Erro ao baixar', e))} disabled={!t.erros && !t.comAvisos}><Download size={14} /> Relatório de correções</button>
          </div>
          {p.linhas.length === 0 ? <EmptyState icon={ListChecks} titulo="Nenhuma linha neste filtro" /> : (
            <div className="table-wrap">
              <table className="table compact imp-tabela">
                <thead><tr><th className="num">Linha</th><th>Ação</th><th>Patrimônio</th><th>Equipamento</th><th>Proprietário</th><th>Status</th><th>Colaborador</th><th>Observações</th><th /></tr></thead>
                <tbody>
                  {p.linhas.map((l) => (
                    <tr key={l.n} className={`no-click ${l.situacao === 'erro' ? 'row-erro' : ''}`}>
                      <td className="num mono muted">{l.n}</td>
                      <td>{l.situacao === 'erro' ? <Badge tom="red">Erro</Badge> : <Badge tom={ACAO[l.acao].tom}>{ACAO[l.acao].txt}</Badge>}{l.editada && <small className="muted"> · corrigida</small>}</td>
                      <td className="mono">{l.dados.patrimonio || '—'}</td>
                      <td><div className="cell-stack"><span>{l.dados.nome || '—'}</span><small className="muted">{l.dados.categoria}</small></div></td>
                      <td className="small">{l.dados.proprietario || '—'}</td>
                      <td className="small">{l.dados.status}</td>
                      <td className="small">{l.colaborador ? <>{l.colaborador.email}{l.colaborador.novo && <Badge tom="violet" className="ml-4">novo</Badge>}</> : l.dados.responsavel || '—'}</td>
                      <td className="small"><div className="imp-obs">
                        {Object.values(l.erros).map((e) => <span key={e} className="txt-red"><XCircle size={12} /> {e}</span>)}
                        {l.diferencas.length > 0 && <span className="txt-blue">{l.diferencas.map((d) => d.label).join(', ')}</span>}
                        {l.avisos.slice(0, 2).map((a) => <span key={a} className="muted"><Info size={12} /> {a}</span>)}
                        {l.avisos.length > 2 && <span className="muted">+{l.avisos.length - 2} aviso(s)</span>}
                      </div></td>
                      <td className="num"><div className="imp-acoes">
                        {l.situacao === 'existente' && (
                          <select className="sel-sm" value={l.acao} onChange={(e) => salvarLinha(l.n, { decisao: e.target.value })} aria-label={`Decisão para a linha ${l.n}`}>
                            <option value="ignorar">Ignorar</option><option value="complementar">Completar</option><option value="atualizar">Atualizar</option>
                          </select>
                        )}
                        <button type="button" className="icon-btn ghost sm" onClick={() => setLinhaAberta(l)} aria-label={`Ver e corrigir a linha ${l.n}`} title="Ver e corrigir"><Pencil size={15} /></button>
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {p.paginas > 1 && (
            <div className="table-foot">
              <span className="muted small">{p.total} linha(s) neste filtro</span>
              <div className="pager">
                <button type="button" className="icon-btn" disabled={p.pagina <= 1} onClick={() => verPagina(filtro, p.pagina - 1)} aria-label="Página anterior"><ChevronLeft size={16} /></button>
                <span className="small">{p.pagina} / {p.paginas}</span>
                <button type="button" className="icon-btn" disabled={p.pagina >= p.paginas} onClick={() => verPagina(filtro, p.pagina + 1)} aria-label="Próxima página"><ChevronRight size={16} /></button>
              </div>
            </div>
          )}
          {p.faltando.length > 0 && <p className="inline-warn mx-16"><AlertTriangle size={14} /> Falta definir: {p.faltando.join(' · ')}. <button type="button" className="link-btn" onClick={() => setEtapa('colunas')}>Ajustar</button></p>}
          <div className="card-foot">
            <button type="button" className="btn btn-ghost" onClick={() => setEtapa('colunas')}><ChevronLeft size={16} /> Colunas e regras</button>
            <span className="grow" />
            <span className="muted small hide-sm">{aImportar ? `${aImportar} linha(s) serão gravadas` : 'Nenhuma linha para gravar'}</span>
            <button type="button" className="btn btn-primary" disabled={!aImportar || p.faltando.length > 0} onClick={() => setConfirmar(true)}>Importar…</button>
          </div>
        </section>
      )}

      {etapa === 'fim' && resultado && (
        <section className="card imp-fim">
          <CheckCircle2 size={34} className="txt-green" />
          <h2>Importação concluída</h2>
          <p className="muted">{resultado.arquivo} · {dataHora(resultado.em)}</p>
          <div className="imp-resumo center">
            <Resumo n={resultado.totais.criados} label="criados" tom="green" />
            <Resumo n={resultado.totais.atualizados + resultado.totais.complementados} label="atualizados" tom="blue" />
            <Resumo n={resultado.totais.ignorados} label="ignorados" tom="slate" />
            <Resumo n={resultado.totais.erros} label="com erro" tom="red" />
            {resultado.totais.colaboradoresCriados > 0 && <Resumo n={resultado.totais.colaboradoresCriados} label="colaboradores" tom="violet" />}
          </div>
          <div className="row-gap center">
            <Link href="/ativos" className="btn btn-primary"><Boxes size={16} /> Ver no inventário</Link>
            <button type="button" className="btn" onClick={() => api.importacao.relatorioFinal(resultado.id).catch((e) => falhou('Erro ao baixar', e))}><Download size={16} /> Relatório</button>
            {!resultado.desfeitaEm && <button type="button" className="btn btn-ghost" onClick={() => desfazer(resultado)}><Undo2 size={16} /> Desfazer</button>}
            <button type="button" className="btn btn-ghost" onClick={recomecar}><RotateCcw size={16} /> Importar outro arquivo</button>
          </div>
        </section>
      )}

      <details className="card hist-imp">
        <summary><span className="section-title"><History size={17} /> Importações anteriores</span><span className="muted small">{historico ? historico.length : ''}</span></summary>
        {!historico ? <Skeleton h={80} /> : historico.length === 0 ? <p className="muted small">Nenhuma importação ainda.</p> : (
          <ul className="row-list">
            {historico.slice(0, 15).map((h) => (
              <li key={h.id} className="row-item static">
                <FileSpreadsheet size={18} className="muted" />
                <span className="grow"><strong>{h.arquivo}</strong><small className="muted">{relativo(h.em)} · {h.por} · {h.totais.criados} criado(s), {h.totais.atualizados + h.totais.complementados} atualizado(s), {h.totais.erros} com erro{h.desfeitaEm ? ` · desfeita por ${h.desfeitaPor}` : ''}</small></span>
                {h.desfeitaEm && <Badge tom="slate">Desfeita</Badge>}
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => api.importacao.relatorioFinal(h.id).catch((e) => falhou('Erro ao baixar', e))}><Download size={14} /> Relatório</button>
                {!h.desfeitaEm && <button type="button" className="btn btn-sm btn-ghost" onClick={() => desfazer(h)}><Undo2 size={14} /> Desfazer</button>}
              </li>
            ))}
          </ul>
        )}
      </details>

      <LinhaModal linha={linhaAberta} fechar={() => setLinhaAberta(null)} salvar={async (n, d) => { const l = await salvarLinha(n, d); if (l) setLinhaAberta(l); return l; }} />

      <Modal aberto={confirmar} onClose={() => setConfirmar(false)} titulo="Confirmar importação" icone={FileUp} largura={520}
        rodape={<><button type="button" className="btn" onClick={() => setConfirmar(false)}>Voltar</button>
          <button type="button" className="btn btn-primary" onClick={importar} disabled={ocupado}>{ocupado ? 'Importando…' : 'Confirmar e importar'}</button></>}>
        {t && (
          <ul className="confirm-list">
            <li><strong>{t.criar}</strong> equipamento(s) novo(s)</li>
            {t.atualizar > 0 && <li><strong>{t.atualizar}</strong> equipamento(s) atualizado(s) com os valores da planilha</li>}
            {t.complementar > 0 && <li><strong>{t.complementar}</strong> equipamento(s) com campos vazios completados</li>}
            {t.colaboradoresNovos > 0 && <li><strong>{t.colaboradoresNovos}</strong> colaborador(es) cadastrado(s) pelo e-mail</li>}
            <li className="muted">{t.ignorar} linha(s) não serão gravadas ({t.erros} com erro).</li>
          </ul>
        )}
        <p className="small muted"><Info size={13} /> Nada é apagado. Os valores anteriores ficam registrados e a importação pode ser desfeita depois.</p>
      </Modal>
    </div>
  );
}

function Resumo({ n, label, tom }) {
  return <div className={`imp-num tone-${tom}`}><strong>{n}</strong><span>{label}</span></div>;
}

// Etapa 1: escolher ou arrastar o arquivo
function Arquivo({ enviar, ocupado }) {
  const [arrastando, setArrastando] = useState(false);
  const input = useRef(null);
  return (
    <section className={`card dropzone ${arrastando ? 'over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setArrastando(true); }} onDragLeave={() => setArrastando(false)}
      onDrop={(e) => { e.preventDefault(); setArrastando(false); enviar(e.dataTransfer.files?.[0]); }}>
      {ocupado ? <Loader2 size={34} className="spin muted" /> : <UploadCloud size={34} className="muted" />}
      <h2>{ocupado ? 'Lendo a planilha…' : 'Arraste o arquivo aqui'}</h2>
      <p className="muted small">CSV (separado por ; , ou tabulação) ou Excel .xlsx · até 12 MB e 10.000 linhas</p>
      <button type="button" className="btn btn-primary" onClick={() => input.current?.click()} disabled={ocupado}><FileUp size={16} /> Escolher arquivo</button>
      <input ref={input} type="file" accept=".csv,.xlsx,.xlsm,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(e) => { enviar(e.target.files?.[0]); e.target.value = ''; }} />
      <ul className="dz-dicas small muted">
        <li>No Desk Manager ou no SharePoint, exporte a lista de equipamentos para Excel ou CSV.</li>
        <li>Patrimônio (ou número de série) e proprietário são os campos essenciais; o resto é opcional.</li>
        <li>Você revisa tudo antes de gravar — e pode desfazer depois.</li>
      </ul>
    </section>
  );
}

// Detalhe e correção de uma linha
function LinhaModal({ linha, fechar, salvar }) {
  const [v, setV] = useState({});
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (!linha) return;
    const d = linha.dados;
    setV({ patrimonio: d.patrimonio, numeroSerie: d.numeroSerie, nome: d.nome, categoria: d.categoria, status: d.status, proprietario: d.proprietario || '',
      colaboradorEmail: linha.colaborador?.email || '', responsavel: d.responsavel, localizacao: d.localizacao });
  }, [linha]);
  if (!linha) return null;
  async function aplicar() {
    setSalvando(true);
    await salvar(linha.n, { valores: v });
    setSalvando(false);
  }
  const erro = (k) => linha.erros[k === 'colaboradorEmail' ? 'colaboradorId' : k];
  return (
    <Modal aberto onClose={fechar} titulo={`Linha ${linha.n}`} subtitulo={linha.situacao === 'erro' ? 'Corrija os campos destacados — a linha volta a ser importada.' : linha.existente ? `Já cadastrado como ${linha.existente.patrimonio} · ${linha.existente.nome}` : 'Será criado como novo equipamento.'} largura={720}
      rodape={<><button type="button" className="btn" onClick={() => salvar(linha.n, { restaurar: true })}>Desfazer correções</button><span className="grow" /><button type="button" className="btn" onClick={fechar}>Fechar</button>
        <button type="button" className="btn btn-primary" onClick={aplicar} disabled={salvando}>{salvando ? 'Aplicando…' : 'Aplicar correção'}</button></>}>
      {Object.keys(linha.erros).length > 0 && <div className="alert alert-error small">{Object.values(linha.erros).join(' ')}</div>}
      {linha.diferencas.length > 0 && (
        <div className="diff-box">
          <strong className="small">O que vai mudar no cadastro</strong>
          <ul>{linha.diferencas.map((d) => <li key={d.campo} className="small"><span className="muted">{d.label}:</span> <s>{String(d.atual || '—')}</s> → <strong>{Array.isArray(d.novo) ? d.novo.join(', ') : String(d.novo)}</strong></li>)}</ul>
        </div>
      )}
      <div className="form-grid">
        {EDITAVEIS.map(([k, label]) => (
          <Field key={k} label={label} erro={erro(k)} id={`ln-${k}`}>
            <input id={`ln-${k}`} value={v[k] ?? ''} onChange={(e) => setV((x) => ({ ...x, [k]: e.target.value }))} aria-invalid={!!erro(k)} />
          </Field>
        ))}
      </div>
      {linha.avisos.length > 0 && <ul className="avisos-lista small">{linha.avisos.map((a) => <li key={a}><Info size={12} /> {a}</li>)}</ul>}
      <details className="mt-12"><summary className="small">Valores originais da planilha</summary>
        <dl className="orig-grid small">{Object.entries(linha.original).map(([k, val]) => <div key={k}><dt className="muted">{k}</dt><dd>{val || '—'}</dd></div>)}</dl>
      </details>
    </Modal>
  );
}

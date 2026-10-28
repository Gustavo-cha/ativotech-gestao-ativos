'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, User, Briefcase, Building2, MapPin, Truck, Send, Lock, XCircle, Search, Hammer, PackageCheck, ArrowRightLeft,
  StickyNote, MessageSquare, History, Hash, RefreshCw, Package, Wand2, Minus, Plus, Check, PackageX, CalendarClock, Pencil, Store, Laptop, Mail, ChevronDown
} from 'lucide-react';
import { Avatar, Badge, Modal, Field, Skeleton, ErroApi, EmptyState, Menu, MenuItem, CategoriaIcon, Progress } from '../ui';
import { SolicitacaoBadge, UrgenciaBadge, EtapasSolicitacao, AvisoPrevisao, NovaBadge, DestinoBox, RastreioBox } from './Status';
import { useToast, useUI } from '../providers';
import { useApi } from '@/lib/hooks';
import { useVistos } from '@/lib/portal';
import { api } from '@/lib/api';
import { data as fmtData, dataHora, relativo, isoLocal } from '@/lib/format';
import { TOM_SOLICITACAO, SITUACAO_ESTOQUE, TOM_PERFIL, SIGLA_PERFIL, DESC_STATUS } from '@/lib/constants';

const TRANSPORTADORAS = ['Correios (SEDEX)', 'Correios (PAC)', 'Jadlog', 'Loggi', 'Total Express', 'Azul Cargo', 'Motoboy', 'Entrega própria (TI)', 'Outra'];
const EDITAVEL = ['Pendente', 'Em análise', 'Aguardando estoque', 'Em preparação'];

export default function SolicitacaoDetalhe({ id, voltar }) {
  const { toast } = useToast();
  const ui = useUI();
  const [, setVistos] = useVistos();
  const { data: s, erro, setData, recarregar } = useApi(() => api.solicitacoes.obter(id), [id]);
  const [texto, setTexto] = useState('');
  const [janela, setJanela] = useState(null); // { tipo: 'rejeitar'|'cancelar'|'status'|'envio'|'editar-envio'|'entregue'|'linha', linha? }
  const [ocupado, setOcupado] = useState(false);
  const marcouVisto = useRef(false);

  // RH: marca como lida a última novidade
  useEffect(() => {
    if (!s?.atualizacoes?.length || s.podeGerenciar) return;
    const ultima = s.atualizacoes[s.atualizacoes.length - 1].em;
    setVistos((v) => (v[s.id] === ultima ? v : { ...v, [s.id]: ultima }));
  }, [s, setVistos]);

  // TI: abrir a solicitação tira o destaque de "nova" (para toda a equipe)
  useEffect(() => {
    if (!s?.nova || marcouVisto.current) return;
    marcouVisto.current = true;
    api.solicitacoes.visto(s.id).then(setData).catch(() => {});
  }, [s, setData]);

  if (erro) return <div className="page"><Link href={voltar.href} className="back-link"><ArrowLeft size={15} /> {voltar.label}</Link><ErroApi erro={erro} onRetry={recarregar} /></div>;
  if (!s) return <div className="page"><Skeleton h={180} /><Skeleton h={120} /><Skeleton h={340} /></div>;

  const ativa = !['Entregue', 'Cancelado'].includes(s.status);
  const gestor = s.podeGerenciar;
  const retirada = s.entrega?.modalidade === 'retirada';
  const podeReservar = gestor && EDITAVEL.includes(s.status);
  const completo = s.progressoReserva?.completo;

  async function executar(fn, sucesso, som = 'sucesso') {
    setOcupado(true);
    try {
      const r = await fn();
      if (r) setData(r);
      if (sucesso) toast({ tipo: 'sucesso', titulo: typeof sucesso === 'function' ? sucesso(r) : sucesso, som });
      setJanela(null);
      return r;
    } catch (e) {
      toast({ tipo: 'erro', titulo: 'Não foi possível concluir', msg: e.message });
      return null;
    } finally {
      setOcupado(false);
    }
  }

  async function mudarStatus(status, extras = {}) {
    const som = status === 'Entregue' ? 'conclusao' : status === 'Enviado' ? 'envio' : 'sucesso';
    const r = await executar(() => api.solicitacoes.status(s.id, status, extras), `${s.numero}: ${status}`, som);
    return r;
  }

  const reservarTudo = () => executar(() => api.solicitacoes.reservarTudo(s.id),
    (r) => (r.reservadosAgora?.length ? `Reservado: ${r.reservadosAgora.join(', ')}` : 'Nada disponível para reservar agora'), 'soltar');

  async function enviarMensagem(e) {
    e.preventDefault();
    if (!texto.trim()) return;
    const r = await executar(() => api.solicitacoes.comentar(s.id, texto), null);
    if (r) { setTexto(''); }
  }

  // Próxima ação sugerida conforme a etapa
  let principal = null;
  if (gestor && ativa) {
    if (s.status === 'Pendente') principal = { label: 'Iniciar análise', icone: Search, run: () => mudarStatus('Em análise') };
    else if (['Em análise', 'Aguardando estoque'].includes(s.status)) {
      principal = completo
        ? { label: 'Iniciar preparação', icone: Hammer, run: () => mudarStatus('Em preparação') }
        : { label: 'Reservar itens disponíveis', icone: Wand2, run: reservarTudo };
    } else if (s.status === 'Em preparação') {
      principal = retirada
        ? { label: 'Confirmar retirada', icone: PackageCheck, run: () => setJanela({ tipo: 'entregue' }) }
        : { label: 'Registrar envio', icone: Truck, run: () => setJanela({ tipo: 'envio' }) };
    } else if (s.status === 'Enviado') principal = { label: 'Confirmar entrega', icone: PackageCheck, run: () => setJanela({ tipo: 'entregue' }) };
  }

  return (
    <div className="page">
      <Link href={voltar.href} className="back-link"><ArrowLeft size={15} /> {voltar.label}</Link>

      <section className={`card sol-hero tone-${TOM_SOLICITACAO[s.status]} ${s.nova ? 'is-nova' : ''}`}>
        <div className="sol-hero-main">
          <div className="badge-row">
            <span className="mono sol-num"><Hash size={13} />{s.numero}</span>
            {s.nova && <NovaBadge />}
            <SolicitacaoBadge status={s.status} rejeitada={s.rejeitada} />
            <span className={`owner-tag ${s.proprietario === 'H&CO B2Finance' ? 'b2f' : ''}`}><Building2 size={11} /> {s.proprietario}</span>
            <Badge tom="slate">{s.tipo}</Badge>
            <Badge tom={retirada ? 'violet' : 'cyan'}>{retirada ? <><Store size={11} /> Retirada</> : <><Truck size={11} /> Envio</>}</Badge>
            <UrgenciaBadge s={s} />
          </div>
          <h1>{s.nomeAdmitido}</h1>
          <p className="muted hero-meta">
            <span><Briefcase size={14} /> {s.cargo}</span>
            <span><Building2 size={14} /> {s.departamento}</span>
            <span><MapPin size={14} /> {retirada ? s.entrega.unidade : `${s.entrega?.cidade}/${s.entrega?.uf}`}</span>
            <span><CalendarClock size={14} /> Admissão {fmtData(s.dataAdmissao)}</span>
            {s.emailColaborador && <span><Mail size={14} /> {s.emailColaborador}</span>}
          </p>
        </div>
        <div className="asset-hero-actions">
          {principal && <button type="button" className="btn btn-primary" onClick={principal.run} disabled={ocupado}><principal.icone size={16} /> {principal.label}</button>}
          {gestor && ativa && (
            <Menu trigger={({ alternar }) => <button type="button" className="btn" onClick={alternar}><ArrowRightLeft size={16} /> Mais ações</button>}>
              {s.proximosStatus?.length > 0 && <MenuItem icone={RefreshCw} onClick={() => setJanela({ tipo: 'status' })}>Alterar status…</MenuItem>}
              {podeReservar && !completo && <MenuItem icone={Wand2} onClick={reservarTudo}>Reservar tudo o que houver</MenuItem>}
              {!retirada && ['Em preparação', 'Enviado'].includes(s.status) && <MenuItem icone={Pencil} onClick={() => setJanela({ tipo: 'editar-envio' })}>Editar dados de envio</MenuItem>}
              {s.status !== 'Enviado' && <MenuItem icone={XCircle} perigo onClick={() => setJanela({ tipo: 'rejeitar' })}>Rejeitar / cancelar…</MenuItem>}
            </Menu>
          )}
          {!gestor && s.podeCancelar && <button type="button" className="btn btn-danger-ghost" onClick={() => setJanela({ tipo: 'cancelar' })}><XCircle size={16} /> Cancelar solicitação</button>}
        </div>
        <EtapasSolicitacao s={s} />
        <p className="muted small status-desc">{s.status === 'Cancelado' ? '' : DESC_STATUS[s.status]}</p>
        {s.status === 'Cancelado' && s.motivoCancelamento && (
          <div className="motivo-box"><XCircle size={16} /> <span><strong>{s.rejeitada ? 'Motivo da rejeição' : 'Motivo do cancelamento'}:</strong> {s.motivoCancelamento}</span></div>
        )}
        {!gestor && !s.podeCancelar && ativa && <p className="muted small readonly-note"><Lock size={13} /> Os itens já estão com a TI. Para cancelar agora, fale com a equipe pelas mensagens.</p>}
      </section>

      <div className="sol-grid">
        <div className="sol-main">
          <ItensCard s={s} gestor={gestor} podeReservar={podeReservar} ocupado={ocupado}
            reservarTudo={reservarTudo}
            escolher={(linha) => setJanela({ tipo: 'linha', linha })}
            reservarQtd={(linha, q) => executar(() => api.solicitacoes.reservarLinha(s.id, linha.id, { quantidade: q }), q ? `${linha.nome}: ${q} reservado(s)` : `${linha.nome}: reserva liberada`, q ? 'soltar' : 'excluir')} />

          <section className="card">
            <h2 className="section-title"><User size={17} /> Dados da solicitação</h2>
            <dl className="info-grid three">
              <Info label="Solicitante" valor={s.solicitanteNome} />
              <Info label="Proprietário dos equipamentos" valor={s.proprietario} />
              <div className="info-cell"><dt>E-mail corporativo do colaborador</dt><dd>
                {s.colaborador && gestor ? <Link href={`/colaboradores?id=${s.colaborador.id}`}>{s.emailColaborador}</Link> : s.emailColaborador || <span className="muted">Não informado</span>}
                {(gestor || ativa) && <button type="button" className="icon-btn ghost xs" onClick={() => setJanela({ tipo: 'email' })} aria-label="Alterar e-mail do colaborador"><Pencil size={12} /></button>}
              </dd></div>
              <Info label="Aberta em" valor={`${dataHora(s.criadoEm)} (${relativo(s.criadoEm)})`} />
              <Info label="Tipo" valor={s.tipo} />
              <Info label={s.tipo === 'Nova admissão' ? 'Data de admissão' : 'Precisa até'} valor={fmtData(s.dataAdmissao)} destaque={s.urgencia === 'critica'} />
              <Info label="Previsão de entrega" valor={s.previsaoEntrega ? fmtData(s.previsaoEntrega) : 'A definir pela TI'} destaque={s.entregaAtrasada} />
              <Info label="Última atualização" valor={relativo(s.atualizadoEm)} />
              {s.equipamentoAtual && <Info label="Equipamento atual" valor={s.equipamentoAtual} />}
              {gestor && s.vistaPorTI && <Info label="Aberta pela TI" valor={`${s.vistaPorTI.por} · ${relativo(s.vistaPorTI.em)}`} />}
            </dl>
            <AvisoPrevisao s={s} />
            {s.observacoes && <div className="desc-box"><strong className="small muted upper">Observações</strong><p>{s.observacoes}</p></div>}
          </section>

          <section className="card">
            <h2 className="section-title"><MessageSquare size={17} /> Atualizações <span className="muted">({s.atualizacoes.length})</span></h2>
            <ol className="sol-timeline">
              {s.atualizacoes.map((a) => (
                <li key={a.id} className={`st-item ${a.tipo === 'status' ? `is-status tone-${TOM_SOLICITACAO[a.status] || 'slate'}` : ''}`}>
                  {a.tipo === 'status' ? <span className="st-dot" /> : <Avatar nome={a.autor} size={30} />}
                  <div className="st-body">
                    <div className="st-head">
                      <strong>{a.autor}</strong>
                      {a.autorPerfil && <Badge tom={TOM_PERFIL[a.autorPerfil] || 'slate'}>{SIGLA_PERFIL[a.autorPerfil] || 'TI'}</Badge>}
                      {a.tipo === 'status' && <span className="muted small">mudou para</span>}
                      {a.tipo === 'status' && <SolicitacaoBadge status={a.status} rejeitada={s.rejeitada && a.status === 'Cancelado'} />}
                      <time className="muted small" title={dataHora(a.em)}>{relativo(a.em)}</time>
                    </div>
                    {a.texto && <p>{a.texto}</p>}
                  </div>
                </li>
              ))}
            </ol>
            {ativa && (
              <form className="comment-box" onSubmit={enviarMensagem}>
                <textarea rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Mensagem"
                  placeholder={gestor ? 'Escreva uma atualização para o RH… (Ctrl+Enter envia)' : 'Escreva uma mensagem para a TI… (Ctrl+Enter envia)'}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) enviarMensagem(e); }} />
                <button type="submit" className="btn btn-primary" disabled={!texto.trim() || ocupado}><Send size={15} /> Enviar</button>
              </form>
            )}
          </section>
        </div>

        <aside className="sol-side">
          <section className="card">
            <h2 className="section-title">{retirada ? <Store size={17} /> : <Truck size={17} />} {retirada ? 'Retirada' : 'Entrega e rastreio'}</h2>
            <DestinoBox e={s.entrega} />
            <RastreioBox s={s} />
            {!retirada && s.status === 'Em preparação' && !gestor && <p className="muted small mt-8">O código de rastreio aparece aqui assim que a TI despachar.</p>}
          </section>
          {gestor && ativa && s.status !== 'Enviado' && <PrevisaoCard s={s} salvar={(p) => executar(() => api.solicitacoes.previsao(s.id, p), p ? 'Previsão atualizada' : 'Previsão removida')} />}
          {gestor && <NotasInternas s={s} adicionar={(t) => executar(() => api.solicitacoes.nota(s.id, t), 'Observação interna registrada', 'clique')} />}
          {gestor && <HistoricoAuditoria id={s.id} />}
        </aside>
      </div>

      {gestor && (
        <>
          <LinhaModal s={s} linha={janela?.tipo === 'linha' ? janela.linha : null} fechar={() => setJanela(null)}
            confirmar={(linha, ids) => executar(() => api.solicitacoes.reservarLinha(s.id, linha.id, { ativoIds: ids }), ids.length ? `${linha.categoria}: ${ids.length} reservado(s)` : 'Reserva liberada', ids.length ? 'soltar' : 'excluir')} />
          <StatusModal s={s} aberto={janela?.tipo === 'status'} fechar={() => setJanela(null)}
            confirmar={(st, msg) => (st === 'Enviado' ? setJanela({ tipo: 'envio', mensagem: msg }) : st === 'Entregue' ? setJanela({ tipo: 'entregue', mensagem: msg }) : mudarStatus(st, { mensagem: msg }))} />
          <EnvioModal s={s} aberto={janela?.tipo === 'envio' || janela?.tipo === 'editar-envio'} editar={janela?.tipo === 'editar-envio'} fechar={() => setJanela(null)} ocupado={ocupado}
            confirmar={(env) => (janela?.tipo === 'editar-envio'
              ? executar(() => api.solicitacoes.envio(s.id, env), 'Dados de envio atualizados')
              : mudarStatus('Enviado', { envio: env, mensagem: janela?.mensagem }))} />
          <EntregueModal s={s} aberto={janela?.tipo === 'entregue'} fechar={() => setJanela(null)} ocupado={ocupado}
            confirmar={(recebidoPor) => mudarStatus('Entregue', { recebidoPor, mensagem: janela?.mensagem })} />
        </>
      )}
      <EmailModal s={s} aberto={janela?.tipo === 'email'} fechar={() => setJanela(null)} ocupado={ocupado}
        confirmar={(email) => executar(() => api.solicitacoes.colaborador(s.id, email), email ? 'E-mail do colaborador salvo' : 'E-mail removido')} />
      <MotivoModal aberto={janela?.tipo === 'rejeitar' || janela?.tipo === 'cancelar'} fechar={() => setJanela(null)}
        titulo={janela?.tipo === 'rejeitar' ? `Rejeitar ${s.numero}` : `Cancelar ${s.numero}`}
        texto={janela?.tipo === 'rejeitar' ? 'O solicitante verá este motivo. Tudo o que estiver reservado volta para o estoque.' : 'A TI será avisada e as reservas voltam ao estoque. Esta ação não pode ser desfeita.'}
        botao={janela?.tipo === 'rejeitar' ? 'Rejeitar' : 'Cancelar solicitação'}
        confirmar={(motivo) => executar(() => (janela?.tipo === 'rejeitar' ? api.solicitacoes.rejeitar(s.id, motivo) : api.solicitacoes.cancelar(s.id, motivo)), janela?.tipo === 'rejeitar' ? 'Solicitação rejeitada' : 'Solicitação cancelada', 'excluir')} />
    </div>
  );
}

function Info({ label, valor, destaque }) {
  return <div className="info-cell"><dt>{label}</dt><dd className={destaque ? 'txt-red' : ''}>{valor || <span className="muted">—</span>}</dd></div>;
}

// ---------- Itens do pedido e reservas ----------
function situacaoLinha(s, l) {
  if (s.status === 'Cancelado') return { txt: 'Cancelado', tom: 'slate' };
  if (s.status === 'Entregue') return { txt: 'Entregue', tom: 'green' };
  if (s.status === 'Enviado') return { txt: 'Enviado', tom: 'pink' };
  if (l.completo) return { txt: s.status === 'Em preparação' ? 'Em preparação' : 'Reservado', tom: s.status === 'Em preparação' ? 'orange' : 'cyan' };
  if (l.alocado > 0) return { txt: `${l.alocado} de ${l.quantidade} reservado(s)`, tom: 'amber' };
  return { txt: 'Aguardando reserva', tom: 'slate' };
}

function ItensCard({ s, gestor, podeReservar, reservarTudo, escolher, reservarQtd, ocupado }) {
  const p = s.progressoReserva || { total: 0, alocado: 0 };
  return (
    <section className="card itens-card">
      <div className="card-head">
        <h2><Package size={17} /> Itens solicitados</h2>
        {gestor && podeReservar && !p.completo && <button type="button" className="btn btn-sm btn-soft" onClick={reservarTudo} disabled={ocupado}><Wand2 size={14} /> Reservar tudo</button>}
      </div>
      {gestor && s.status !== 'Cancelado' && (
        <div className="reserva-progress">
          <Progress valor={p.total ? (p.alocado / p.total) * 100 : 0} tom={p.completo ? 'green' : 'amber'} label="Itens reservados" />
          <span className="small"><strong>{p.alocado}</strong> de {p.total} unidade{p.total === 1 ? '' : 's'} reservada{p.total === 1 ? '' : 's'}{p.completo ? ' — pronto para preparar' : ''}</span>
        </div>
      )}
      <ul className="linhas">
        {s.itens.map((l) => {
          const sit = situacaoLinha(s, l);
          return (
            <li key={l.id} className={`linha ${l.completo ? 'ok' : ''}`}>
              <CategoriaIcon categoria={l.tipo === 'ativo' ? l.categoria : 'Acessório'} boxed size={18} />
              <div className="linha-main">
                <div className="linha-top">
                  <strong>{l.tipo === 'ativo' ? l.categoria : l.nome}</strong>
                  <span className="muted">×{l.quantidade}</span>
                  <Badge tom={sit.tom}>{l.completo && s.status !== 'Cancelado' ? <Check size={11} /> : null}{sit.txt}</Badge>
                </div>
                {l.especificacao && <small className="muted">Especificação: {l.especificacao}</small>}
                {l.tipo === 'ativo' && l.equipamentos?.length > 0 && (
                  <ul className="linha-eqs">
                    {l.equipamentos.map((e, i) => (
                      <li key={e.id || i}>
                        <Laptop size={13} aria-hidden="true" />
                        {gestor ? <Link href={`/ativos/${e.id}`} className="mono">{e.patrimonio}</Link> : null}
                        <span>{gestor ? `${e.marca} ${e.modelo}` : e.nome}</span>
                        {e.configuracao && <small className="muted">{e.configuracao}</small>}
                      </li>
                    ))}
                  </ul>
                )}
                {gestor && l.tipo === 'acessorio' && podeReservar && (
                  <small className={`muted ${l.disponivelEstoque === 0 && !l.completo ? 'txt-amber' : ''}`}>{l.disponivelEstoque} livre(s) no estoque</small>
                )}
              </div>
              {gestor && podeReservar && (
                <div className="linha-acoes">
                  {l.tipo === 'ativo' ? (
                    <button type="button" className="btn btn-sm" onClick={() => escolher(l)} disabled={ocupado}>
                      <Search size={14} /> {l.alocado ? 'Trocar' : 'Escolher'}
                    </button>
                  ) : (
                    <QtdReserva l={l} salvar={(q) => reservarQtd(l, q)} ocupado={ocupado} />
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function QtdReserva({ l, salvar, ocupado }) {
  const [q, setQ] = useState(l.reservado || 0);
  useEffect(() => setQ(l.reservado || 0), [l.reservado]);
  const max = Math.min(l.quantidade, (l.reservado || 0) + (l.disponivelEstoque || 0));
  return (
    <div className="row-gap nowrap">
      <div className="stepper sm" role="group" aria-label={`Reservar ${l.nome}`}>
        <button type="button" onClick={() => setQ((x) => Math.max(0, x - 1))} disabled={q <= 0} aria-label="Diminuir"><Minus size={13} /></button>
        <output>{q}</output>
        <button type="button" onClick={() => setQ((x) => Math.min(max, x + 1))} disabled={q >= max} aria-label="Aumentar"><Plus size={13} /></button>
      </div>
      <button type="button" className="btn btn-sm btn-primary" disabled={q === (l.reservado || 0) || ocupado} onClick={() => salvar(q)}>OK</button>
    </div>
  );
}

// Escolha dos equipamentos com patrimônio para uma linha
function LinhaModal({ s, linha, fechar, confirmar }) {
  const aberto = Boolean(linha);
  const [ids, setIds] = useState([]);
  const [q, setQ] = useState('');
  const { data, erro } = useApi(() => (linha ? api.solicitacoes.disponiveis(s.id, linha.id) : Promise.resolve(null)), [s.id, linha?.id]);
  useEffect(() => { if (linha) { setIds(linha.ativoIds || []); setQ(''); } }, [linha]);
  const lista = useMemo(() => (data || []).filter((n) => `${n.patrimonio} ${n.nome} ${n.marca} ${n.modelo} ${n.configuracao} ${n.localizacao}`.toLowerCase().includes(q.toLowerCase())), [data, q]);
  if (!linha) return null;
  const alternar = (id) => {
    setIds((x) => (x.includes(id) ? x.filter((y) => y !== id) : linha.quantidade === 1 ? [id] : x.length < linha.quantidade ? [...x, id] : x));
  };
  return (
    <Modal aberto={aberto} onClose={fechar} titulo={`Reservar ${linha.categoria.toLowerCase()}${linha.quantidade > 1 ? `s (${linha.quantidade})` : ''}`} subtitulo={`${s.numero} · ${s.nomeAdmitido}${linha.especificacao ? ` · ${linha.especificacao}` : ''}`} icone={Package} largura={680}
      rodape={<>
        <span className="muted small grow">{ids.length} de {linha.quantidade} selecionado(s)</span>
        <button type="button" className="btn" onClick={fechar}>Cancelar</button>
        <button type="button" className="btn btn-primary" disabled={JSON.stringify([...ids].sort()) === JSON.stringify([...(linha.ativoIds || [])].sort())} onClick={() => confirmar(linha, ids)}>
          {ids.length ? 'Salvar reserva' : 'Liberar reserva'}
        </button>
      </>}>
      <p className="muted small mb-8">Um equipamento reservado sai da contagem de disponíveis e não pode ir para outra solicitação.</p>
      {erro ? <ErroApi erro={erro} /> : !data ? <Skeleton h={160} /> : !data.length ? (
        <EmptyState icon={PackageX} titulo={`Nenhum ${linha.categoria.toLowerCase()} disponível`} texto='Cadastre o equipamento em Inventário ou mova a solicitação para "Aguardando estoque".' />
      ) : (
        <>
          {data.length > 4 && <div className="search-input mb-8"><Search size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrar por patrimônio, modelo, configuração, local…" aria-label="Filtrar equipamentos" /></div>}
          <div className="nb-picker" role={linha.quantidade === 1 ? 'radiogroup' : 'group'} aria-label="Equipamentos disponíveis">
            {lista.map((n) => {
              const on = ids.includes(n.id);
              return (
                <button key={n.id} type="button" role={linha.quantidade === 1 ? 'radio' : 'checkbox'} aria-checked={on} className={`nb-option ${on ? 'on' : ''}`} onClick={() => alternar(n.id)}>
                  <span className={linha.quantidade === 1 ? 'nb-radio' : 'nb-check'}>{on && linha.quantidade > 1 && <Check size={12} strokeWidth={3} />}</span>
                  <span className="grow">
                    <strong>{n.patrimonio} · {n.marca} {n.modelo}</strong>
                    <small>{n.configuracao || 'Configuração não informada'}</small>
                    <small className="muted"><MapPin size={11} /> {n.localizacao || '—'}</small>
                  </span>
                  {(linha.ativoIds || []).includes(n.id) ? <Badge tom="cyan">Atual</Badge> : <Badge tom={SITUACAO_ESTOQUE[n.situacao]?.tom}>{SITUACAO_ESTOQUE[n.situacao]?.label}</Badge>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </Modal>
  );
}

function StatusModal({ s, aberto, fechar, confirmar }) {
  const opcoes = (s.proximosStatus || []).filter((x) => x !== 'Cancelado');
  const [status, setStatus] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => { if (aberto) { setStatus(opcoes[0] || ''); setMsg(''); } }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps
  const precisaReserva = ['Em preparação', 'Enviado', 'Entregue'].includes(status) && !s.progressoReserva?.completo;
  return (
    <Modal aberto={aberto} onClose={fechar} titulo="Alterar status" subtitulo={`Atual: ${s.status}`} icone={RefreshCw} largura={540}
      rodape={<><button type="button" className="btn" onClick={fechar}>Cancelar</button>
        <button type="button" className="btn btn-primary" disabled={!status || precisaReserva} onClick={() => confirmar(status, msg)}>{status === 'Enviado' ? 'Continuar' : status === 'Entregue' ? 'Continuar' : 'Confirmar'}</button></>}>
      <Field label="Novo status" wide>
        <div className="chip-select" role="radiogroup" aria-label="Novo status">
          {opcoes.map((o) => <button key={o} type="button" role="radio" aria-checked={status === o} className={`chip tone-${TOM_SOLICITACAO[o]} ${status === o ? 'on' : ''}`} onClick={() => setStatus(o)}>{o}</button>)}
        </div>
      </Field>
      {status && <p className="muted small">{DESC_STATUS[status]}</p>}
      {precisaReserva && <p className="inline-warn">Reserve todos os itens antes de avançar para “{status}”.</p>}
      <Field label="Mensagem ao RH" id="st-msg" dica="Opcional — aparece na linha do tempo da solicitação">
        <textarea id="st-msg" rows={3} value={msg} onChange={(e) => setMsg(e.target.value)} />
      </Field>
    </Modal>
  );
}

export function EnvioModal({ s, aberto, editar, fechar, confirmar, ocupado }) {
  const [d, setD] = useState({});
  const [erros, setErros] = useState({});
  useEffect(() => {
    if (aberto) {
      setD({ transportadora: s.envio?.transportadora || '', codigoRastreio: s.envio?.codigoRastreio || '', dataEnvio: s.envio?.dataEnvio || isoLocal(), previsaoEntrega: s.envio?.previsaoEntrega || s.previsaoEntrega || '' });
      setErros({});
    }
  }, [aberto, s]);
  const set = (k) => (e) => { setD((x) => ({ ...x, [k]: e.target.value })); setErros((x) => ({ ...x, [k]: undefined })); };
  const enviar = async () => {
    const e = {};
    if (!d.transportadora) e.transportadora = 'Escolha a transportadora.';
    if (!d.dataEnvio && !editar) e.dataEnvio = 'Informe a data de envio.';
    if (d.dataEnvio && d.dataEnvio > isoLocal()) e.dataEnvio = 'Não pode estar no futuro.';
    if (d.previsaoEntrega && d.dataEnvio && d.previsaoEntrega < d.dataEnvio) e.previsaoEntrega = 'Antes da data de envio.';
    if (Object.keys(e).length) { setErros(e); return; }
    await confirmar(d);
  };
  return (
    <Modal aberto={aberto} onClose={fechar} titulo={editar ? 'Dados de envio' : `Registrar envio de ${s.numero}`} subtitulo={`${s.nomeAdmitido} · ${s.enderecoResumo}`} icone={Truck} largura={600}
      rodape={<><button type="button" className="btn" onClick={fechar}>Cancelar</button>
        <button type="button" className="btn btn-primary" onClick={enviar} disabled={ocupado}><Truck size={16} /> {editar ? 'Salvar' : 'Confirmar envio'}</button></>}>
      {!editar && <p className="muted small mb-8">Ao confirmar, os equipamentos passam a “em trânsito” e os acessórios saem do estoque. O RH recebe o rastreio na hora.</p>}
      <div className="form-grid">
        <Field label="Transportadora" obrigatorio erro={erros.transportadora} id="env-transp">
          <select id="env-transp" value={d.transportadora || ''} onChange={set('transportadora')} aria-invalid={!!erros.transportadora}>
            <option value="">Selecione</option>
            {TRANSPORTADORAS.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Código de rastreio" erro={erros.codigoRastreio} id="env-cod" dica="Letras e números, sem espaços">
          <input id="env-cod" className="mono" value={d.codigoRastreio || ''} onChange={(e) => setD((x) => ({ ...x, codigoRastreio: e.target.value.toUpperCase().replace(/\s+/g, '') }))} placeholder="Ex.: AA123456789BR" maxLength={40} />
        </Field>
        <Field label="Data de envio" obrigatorio erro={erros.dataEnvio} id="env-data">
          <input id="env-data" type="date" max={isoLocal()} value={d.dataEnvio || ''} onChange={set('dataEnvio')} aria-invalid={!!erros.dataEnvio} />
        </Field>
        <Field label="Previsão de entrega" erro={erros.previsaoEntrega} id="env-prev" dica={`Admissão em ${fmtData(s.dataAdmissao)}`}>
          <input id="env-prev" type="date" min={d.dataEnvio || isoLocal()} value={d.previsaoEntrega || ''} onChange={set('previsaoEntrega')} aria-invalid={!!erros.previsaoEntrega} />
        </Field>
      </div>
      {d.previsaoEntrega && d.previsaoEntrega > s.dataAdmissao && <p className="inline-warn">A previsão é depois da data de admissão.</p>}
    </Modal>
  );
}

export function EntregueModal({ s, aberto, fechar, confirmar, ocupado }) {
  const [quem, setQuem] = useState('');
  useEffect(() => { if (aberto) setQuem(s.entrega?.destinatario || s.nomeAdmitido); }, [aberto, s]);
  const retirada = s.entrega?.modalidade === 'retirada';
  return (
    <Modal aberto={aberto} onClose={fechar} titulo={retirada ? 'Confirmar retirada' : 'Confirmar entrega'} subtitulo={`${s.numero} · ${s.itensResumo}`} icone={PackageCheck} largura={520}
      rodape={<><button type="button" className="btn" onClick={fechar}>Cancelar</button>
        <button type="button" className="btn btn-primary" disabled={quem.trim().length < 2 || ocupado} onClick={() => confirmar(quem.trim())}><PackageCheck size={16} /> Confirmar</button></>}>
      <p className="muted small mb-8">Os equipamentos passam para “Em uso” com {s.nomeAdmitido} como responsável{retirada ? ' e os acessórios saem do estoque' : ''}.</p>
      <Field label="Recebido por" obrigatorio id="ent-quem" dica="Quem assinou ou retirou (colaborador, portaria, recepção…)">
        <input id="ent-quem" value={quem} onChange={(e) => setQuem(e.target.value)} />
      </Field>
    </Modal>
  );
}

function PrevisaoCard({ s, salvar }) {
  const [p, setP] = useState(s.previsaoEntrega || '');
  useEffect(() => setP(s.previsaoEntrega || ''), [s.previsaoEntrega]);
  return (
    <section className="card">
      <h2 className="section-title"><CalendarClock size={17} /> Previsão de entrega</h2>
      <div className="row-gap">
        <input type="date" value={p} min={isoLocal()} onChange={(e) => setP(e.target.value)} aria-label="Previsão de entrega" />
        <button type="button" className="btn btn-sm btn-primary" disabled={p === (s.previsaoEntrega || '')} onClick={() => salvar(p)}>Salvar</button>
      </div>
      <p className="muted small mt-8">Admissão em {fmtData(s.dataAdmissao)}. O RH é avisado de cada alteração.</p>
      {p && p > s.dataAdmissao && <p className="inline-warn">Depois da data de admissão.</p>}
    </section>
  );
}

function NotasInternas({ s, adicionar }) {
  const [t, setT] = useState('');
  return (
    <section className="card notas-card">
      <h2 className="section-title"><StickyNote size={17} /> Observações internas <Badge tom="slate"><Lock size={10} /> Só TI</Badge></h2>
      {s.notasInternas.length === 0 && <p className="muted small">Nada registrado. O RH não vê estas observações.</p>}
      <ul className="notas-list">
        {s.notasInternas.map((n) => <li key={n.id}><p>{n.texto}</p><small className="muted">{n.autor} · {relativo(n.em)}</small></li>)}
      </ul>
      <form className="row-gap mt-8" onSubmit={async (e) => { e.preventDefault(); if (t.trim() && await adicionar(t)) setT(''); }}>
        <input value={t} onChange={(e) => setT(e.target.value)} placeholder="Ex.: instalar VPN do cliente" aria-label="Nova observação interna" />
        <button type="submit" className="btn btn-sm" disabled={!t.trim()}>Adicionar</button>
      </form>
    </section>
  );
}

// Auditoria recolhida: só carrega quando aberta
function HistoricoAuditoria({ id }) {
  const [aberto, setAberto] = useState(false);
  const { data } = useApi(() => (aberto ? api.historico({ entidadeId: id, limite: 20 }) : Promise.resolve(null)), [id, aberto]);
  return (
    <details className="card more-details" onToggle={(e) => setAberto(e.currentTarget.open)}>
      <summary><span className="section-title"><History size={17} /> Auditoria</span><ChevronDown size={16} className="chev" aria-hidden="true" /></summary>
      {!data ? <p className="muted small mt-8">{aberto ? 'Carregando…' : ''}</p> : (
        <ul className="audit-list mt-8">
          {data.map((h) => <li key={h.id}><strong>{h.usuario}</strong> {h.acao} <span className="muted">· {relativo(h.em)}</span>{h.detalhe && <small>{h.detalhe}</small>}</li>)}
        </ul>
      )}
    </details>
  );
}

function EmailModal({ s, aberto, fechar, confirmar, ocupado }) {
  const [email, setEmail] = useState('');
  const [erro, setErro] = useState('');
  useEffect(() => { if (aberto) { setEmail(s.emailColaborador || ''); setErro(''); } }, [aberto, s.emailColaborador]);
  async function salvar() {
    const e = email.trim().toLowerCase();
    if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) { setErro('E-mail inválido.'); return; }
    await confirmar(e);
  }
  return (
    <Modal aberto={aberto} onClose={fechar} titulo="E-mail corporativo do colaborador" subtitulo={`${s.numero} · ${s.nomeAdmitido}`} icone={Mail} largura={480}
      rodape={<><button type="button" className="btn" onClick={fechar}>Cancelar</button><button type="button" className="btn btn-primary" disabled={ocupado} onClick={salvar}>Salvar</button></>}>
      <Field label="E-mail corporativo" erro={erro} id="sol-email" dica={s.status === 'Entregue' ? 'Os equipamentos entregues serão vinculados a este colaborador.' : 'Na entrega, o colaborador é cadastrado e vinculado aos equipamentos.'}>
        <input id="sol-email" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setErro(''); }} placeholder="nome.sobrenome@hco.com" aria-invalid={!!erro} />
      </Field>
    </Modal>
  );
}

function MotivoModal({ aberto, fechar, titulo, texto, botao, confirmar }) {
  const [motivo, setMotivo] = useState('');
  useEffect(() => { if (aberto) setMotivo(''); }, [aberto]);
  return (
    <Modal aberto={aberto} onClose={fechar} titulo={titulo} subtitulo={texto} icone={XCircle} largura={500}
      rodape={<><button type="button" className="btn" onClick={fechar}>Voltar</button>
        <button type="button" className="btn btn-danger" disabled={motivo.trim().length < 5} onClick={() => confirmar(motivo.trim())}>{botao}</button></>}>
      <Field label="Motivo" obrigatorio id="motivo" dica="Mínimo de 5 caracteres">
        <textarea id="motivo" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </Field>
    </Modal>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, FilePlus2, UserPlus, Repeat, HelpCircle, Send, CheckCircle2, AlertTriangle, CalendarClock, Info, Hash,
  Truck, Store, Minus, Plus, Check, PackageSearch, MapPin, Loader2, Building2
} from 'lucide-react';
import { PageHeader, Field, Segmented, CategoriaIcon, Skeleton } from '@/components/ui';
import { useAuth } from '@/components/auth';
import { useToast, useUI } from '@/components/providers';
import { useApi } from '@/lib/hooks';
import { api } from '@/lib/api';
import { isoLocal, data as fmtData } from '@/lib/format';

const TIPOS = [
  { id: 'Nova admissão', icone: UserPlus, desc: 'Colaborador que vai começar' },
  { id: 'Substituição de equipamento', icone: Repeat, desc: 'Troca de um equipamento atual' },
  { id: 'Outra necessidade', icone: HelpCircle, desc: 'Estágio, projeto, temporário…' }
];
const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
const UNIDADES = ['Matriz · recepção da TI (São Paulo)', 'Filial Campinas · almoxarifado', 'Filial Rio de Janeiro · recepção'];
const PROPRIETARIOS = ['H&CO', 'H&CO B2Finance'];
const DEPARTAMENTOS = ['Financeiro', 'Contabilidade', 'Auditoria', 'Comercial', 'Marketing', 'Recursos Humanos', 'Jurídico', 'TI', 'Design', 'Operações'];
const ENTREGA_VAZIA = { modalidade: 'envio', unidade: '', cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '', destinatario: '', telefone: '' };

const mascaraCep = (v) => v.replace(/\D/g, '').slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2');
const mascaraTel = (v) => {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

export default function NovaSolicitacao() {
  const { usuario } = useAuth();
  const { toast } = useToast();
  const ui = useUI();
  const { data: catalogo } = useApi(() => api.solicitacoes.catalogo(), []);
  const [d, setD] = useState({ solicitanteNome: usuario.nome, nomeAdmitido: '', emailColaborador: '', departamento: usuario.departamento === 'Recursos Humanos' ? '' : (usuario.departamento || ''), cargo: '', dataAdmissao: '', tipo: 'Nova admissão', equipamentoAtual: '', observacoes: '', proprietario: '' });
  const [entrega, setEntrega] = useState(ENTREGA_VAZIA);
  const [sel, setSel] = useState({});
  // Proprietário vindo do estoque (/portal/nova?proprietario=…)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('proprietario');
    if (PROPRIETARIOS.includes(p)) escolherDono(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function escolherDono(p) {
    setD((x) => ({ ...x, proprietario: p }));
    // Os itens escolhidos pertencem a um estoque só: trocar de proprietário recomeça a seleção
    setSel({ [`ativo:${p}:Notebook`]: { quantidade: 1, especificacao: '' } });
    setErros((er) => ({ ...er, proprietario: undefined, itens: undefined }));
  }
  const [erros, setErros] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [criada, setCriada] = useState(null);
  const [buscandoCep, setBuscandoCep] = useState(false);

  const limparErro = (k) => erros[k] && setErros((er) => ({ ...er, [k]: undefined }));
  const set = (k) => (e) => { const v = e?.target ? e.target.value : e; setD((x) => ({ ...x, [k]: v })); limparErro(k); };
  const setE = (k, fmt) => (e) => { const v = fmt ? fmt(e.target.value) : e.target.value; setEntrega((x) => ({ ...x, [k]: v })); limparErro(`entrega.${k}`); };

  const porChave = useMemo(() => Object.fromEntries((catalogo || []).map((c) => [c.chave, c])), [catalogo]);
  const doDono = (catalogo || []).filter((c) => c.proprietario === d.proprietario);
  const equipamentos = doDono.filter((c) => c.tipo === 'ativo');
  const acessorios = doDono.filter((c) => c.tipo === 'acessorio');
  const dispPorDono = (p) => (catalogo || []).filter((c) => c.proprietario === p && c.tipo === 'ativo').reduce((x, c) => x + c.disponivel, 0);
  const escolhidos = Object.entries(sel).filter(([k]) => porChave[k]).map(([k, v]) => ({ ...porChave[k], ...v }));
  const faltando = escolhidos.filter((c) => c.quantidade > c.disponivel);

  function alternar(c) {
    setSel((s) => {
      const n = { ...s };
      if (n[c.chave]) delete n[c.chave];
      else n[c.chave] = { quantidade: 1, especificacao: '' };
      return n;
    });
    limparErro('itens');
  }
  const mudarQtd = (c, delta) => setSel((s) => {
    const max = c.tipo === 'ativo' ? 3 : 10;
    const q = Math.max(1, Math.min(max, (s[c.chave]?.quantidade || 1) + delta));
    return { ...s, [c.chave]: { ...s[c.chave], quantidade: q } };
  });

  // Preenche o endereço pelo CEP (ViaCEP). Se a consulta falhar, o usuário digita normalmente.
  const cepDigitos = entrega.cep.replace(/\D/g, '');
  useEffect(() => {
    if (cepDigitos.length !== 8 || entrega.modalidade !== 'envio') return undefined;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setBuscandoCep(true);
      try {
        const r = await fetch(`https://viacep.com.br/ws/${cepDigitos}/json/`, { signal: ctl.signal });
        const j = await r.json();
        if (!j.erro) {
          setEntrega((x) => ({ ...x, logradouro: x.logradouro || j.logradouro || '', bairro: x.bairro || j.bairro || '', cidade: x.cidade || j.localidade || '', uf: x.uf || j.uf || '' }));
          setErros((er) => ({ ...er, 'entrega.logradouro': undefined, 'entrega.bairro': undefined, 'entrega.cidade': undefined, 'entrega.uf': undefined }));
        }
      } catch { /* sem internet ou bloqueado: preenchimento manual */ }
      setBuscandoCep(false);
    }, 350);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [cepDigitos, entrega.modalidade]);

  // Validação no navegador (a API valida de novo)
  function validar() {
    const e = {};
    if (!d.proprietario) e.proprietario = 'Escolha de qual empresa são os equipamentos.';
    if (d.nomeAdmitido.trim().length < 3) e.nomeAdmitido = 'Informe o nome completo do colaborador.';
    if (d.emailColaborador.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.emailColaborador.trim())) e.emailColaborador = 'E-mail inválido.';
    if (d.departamento.trim().length < 2) e.departamento = 'Informe o departamento ou área.';
    if (d.cargo.trim().length < 2) e.cargo = 'Informe o cargo.';
    if (!d.dataAdmissao) e.dataAdmissao = 'Informe a data.';
    else if (d.dataAdmissao < isoLocal()) e.dataAdmissao = 'A data não pode estar no passado.';
    if (d.tipo === 'Substituição de equipamento' && !d.equipamentoAtual.trim()) e.equipamentoAtual = 'Informe o patrimônio ou modelo atual.';
    if (!escolhidos.length) e.itens = 'Escolha ao menos um equipamento.';
    if (entrega.modalidade === 'retirada') {
      if (entrega.unidade.trim().length < 2) e['entrega.unidade'] = 'Informe a unidade de retirada.';
    } else {
      if (cepDigitos.length !== 8) e['entrega.cep'] = 'CEP deve ter 8 dígitos.';
      if (entrega.logradouro.trim().length < 3) e['entrega.logradouro'] = 'Informe rua/avenida.';
      if (!entrega.numero.trim()) e['entrega.numero'] = 'Informe o número (ou "s/n").';
      if (entrega.bairro.trim().length < 2) e['entrega.bairro'] = 'Informe o bairro.';
      if (entrega.cidade.trim().length < 2) e['entrega.cidade'] = 'Informe a cidade.';
      if (!UFS.includes(entrega.uf)) e['entrega.uf'] = 'Escolha a UF.';
    }
    const tel = entrega.telefone.replace(/\D/g, '');
    if (tel && (tel.length < 10 || tel.length > 11)) e['entrega.telefone'] = 'Telefone com DDD.';
    return e;
  }

  const dias = useMemo(() => (d.dataAdmissao ? Math.round((Date.parse(d.dataAdmissao) - Date.parse(isoLocal())) / 86400000) : null), [d.dataAdmissao]);

  async function enviar(e) {
    e.preventDefault();
    const locais = validar();
    if (Object.keys(locais).length) {
      setErros(locais);
      setTimeout(() => document.querySelector('[aria-invalid="true"], .picker-erro')?.focus?.(), 30);
      return;
    }
    setEnviando(true);
    try {
      const itens = escolhidos.map((c) => (c.tipo === 'ativo'
        ? { tipo: 'ativo', categoria: c.categoria, quantidade: c.quantidade, especificacao: c.especificacao }
        : { tipo: 'acessorio', itemId: c.itemId, quantidade: c.quantidade }));
      const s = await api.solicitacoes.criar({ ...d, itens, entrega });
      setCriada(s);
    } catch (err) {
      setErros(err.campos || {});
      toast({ tipo: 'erro', titulo: 'Não foi possível enviar', msg: err.message });
    } finally {
      setEnviando(false);
    }
  }

  if (criada) {
    return (
      <div className="page page-narrow">
        <section className="card success-card">
          <span className="success-icon"><CheckCircle2 size={34} /></span>
          <h1>Solicitação enviada!</h1>
          <p className="muted">A equipe de TI já foi notificada. Você acompanha cada etapa — análise, preparação, envio e entrega — em “Minhas solicitações”.</p>
          <div className="ticket">
            <span className="muted small upper">Número da solicitação</span>
            <strong className="mono"><Hash size={18} />{criada.numero}</strong>
            <span>{criada.nomeAdmitido} · admissão em {fmtData(criada.dataAdmissao)}</span>
            <span className="small muted">Equipamentos da {criada.proprietario}{criada.emailColaborador ? ` · ${criada.emailColaborador}` : ''}</span>
            <span className="small muted">{criada.itensResumo}</span>
            <span className="small muted">{criada.enderecoResumo}</span>
          </div>
          <div className="row-gap center">
            <Link href={`/portal/solicitacoes/${criada.id}`} className="btn btn-primary">Acompanhar solicitação</Link>
            <button type="button" className="btn" onClick={() => { setCriada(null); setD((x) => ({ ...x, nomeAdmitido: '', emailColaborador: '', cargo: '', dataAdmissao: '', equipamentoAtual: '', observacoes: '' })); setEntrega(ENTREGA_VAZIA); setSel(d.proprietario ? { [`ativo:${d.proprietario}:Notebook`]: { quantidade: 1, especificacao: '' } } : {}); }}>Abrir outra</button>
          </div>
        </section>
      </div>
    );
  }

  const input = (k, props = {}) => <input id={`ns-${k}`} value={d[k]} onChange={set(k)} aria-invalid={!!erros[k]} {...props} />;
  const inputE = (k, props = {}, fmt) => <input id={`ne-${k}`} value={entrega[k]} onChange={setE(k, fmt)} aria-invalid={!!erros[`entrega.${k}`]} {...props} />;

  // Função (e não componente) para não remontar o campo de especificação a cada tecla
  const opcao = (c) => {
    const on = Boolean(sel[c.chave]);
    const q = sel[c.chave]?.quantidade || 1;
    const sem = c.disponivel === 0;
    return (
      <div key={c.chave} className={`pick-card ${on ? 'on' : ''}`}>
        <button type="button" className="pick-main" onClick={() => alternar(c)} aria-pressed={on}>
          <span className="pick-check" aria-hidden="true">{on && <Check size={13} strokeWidth={3} />}</span>
          <CategoriaIcon categoria={c.categoria} boxed size={17} />
          <span className="pick-text">
            <strong>{c.nome}</strong>
            <small className={sem ? 'txt-amber' : 'muted'}>{sem ? 'Sem estoque agora — a TI providencia' : `${c.disponivel} disponíve${c.disponivel === 1 ? 'l' : 'is'}`}</small>
          </span>
        </button>
        {on && (
          <div className="pick-extra">
            <div className="stepper" role="group" aria-label={`Quantidade de ${c.nome}`}>
              <button type="button" onClick={() => mudarQtd(c, -1)} disabled={q <= 1} aria-label="Diminuir"><Minus size={14} /></button>
              <output aria-live="polite">{q}</output>
              <button type="button" onClick={() => mudarQtd(c, 1)} disabled={q >= (c.tipo === 'ativo' ? 3 : 10)} aria-label="Aumentar"><Plus size={14} /></button>
            </div>
            {c.tipo === 'ativo' && (
              <input className="pick-spec" value={sel[c.chave].especificacao} maxLength={200} aria-label={`Especificação de ${c.nome}`}
                placeholder={c.categoria === 'Notebook' ? 'Especificação (opcional): 16 GB, perfil designer…' : 'Especificação (opcional)'}
                onChange={(e) => setSel((s) => ({ ...s, [c.chave]: { ...s[c.chave], especificacao: e.target.value } }))} />
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="page">
      <Link href="/portal" className="back-link"><ArrowLeft size={15} /> Voltar ao portal</Link>
      <PageHeader icone={FilePlus2} titulo="Nova solicitação" subtitulo="Colaborador, equipamentos e entrega. A TI é avisada na hora." />

      <form className="form-layout" onSubmit={enviar} noValidate>
        <div className="form-main">
          <section className="card form-section">
            <h2 className="section-title"><Building2 size={18} /> De qual empresa são os equipamentos? <span className="req" aria-hidden="true">*</span></h2>
            <div className="owner-pick" role="radiogroup" aria-label="Proprietário dos equipamentos">
              {PROPRIETARIOS.map((p) => (
                <button key={p} type="button" role="radio" aria-checked={d.proprietario === p} aria-invalid={!!erros.proprietario} className={`owner-opt ${d.proprietario === p ? 'on' : ''}`} onClick={() => d.proprietario !== p && escolherDono(p)}>
                  <strong>{p}</strong><small>{catalogo ? `${dispPorDono(p)} equipamento(s) disponível(is)` : 'Carregando…'}</small>
                </button>
              ))}
            </div>
            {erros.proprietario && <p className="field-error" role="alert">{erros.proprietario}</p>}
          </section>

          <section className="card form-section">
            <h2 className="section-title">Tipo de solicitação</h2>
            <div className="type-grid" role="radiogroup" aria-label="Tipo de solicitação">
              {TIPOS.map((t) => {
                const I = t.icone;
                return (
                  <button key={t.id} type="button" role="radio" aria-checked={d.tipo === t.id} className={`type-card ${d.tipo === t.id ? 'on' : ''}`} onClick={() => { set('tipo')(t.id); }}>
                    <span className="type-icon"><I size={20} /></span>
                    <strong>{t.id}</strong>
                    <small>{t.desc}</small>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="card form-section">
            <h2 className="section-title">Dados do colaborador</h2>
            <div className="form-grid">
              <Field label="Nome do colaborador" obrigatorio erro={erros.nomeAdmitido} id="ns-nomeAdmitido">{input('nomeAdmitido', { placeholder: 'Nome completo', autoComplete: 'off' })}</Field>
              <Field label="E-mail corporativo" erro={erros.emailColaborador} id="ns-emailColaborador" dica="Se já existir. Identifica quem recebe o equipamento.">{input('emailColaborador', { type: 'email', placeholder: 'nome.sobrenome@hco.com', autoComplete: 'off' })}</Field>
              <Field label="Cargo" obrigatorio erro={erros.cargo} id="ns-cargo">{input('cargo', { placeholder: 'Ex.: Analista Contábil' })}</Field>
              <Field label="Departamento ou área" obrigatorio erro={erros.departamento} id="ns-departamento">{input('departamento', { list: 'dl-deps' })}</Field>
              <Field label={d.tipo === 'Nova admissão' ? 'Data de admissão' : 'Data em que precisa dos equipamentos'} obrigatorio erro={erros.dataAdmissao} id="ns-dataAdmissao">
                {input('dataAdmissao', { type: 'date', min: isoLocal() })}
              </Field>
              {d.tipo === 'Substituição de equipamento' && (
                <Field label="Equipamento atual" obrigatorio erro={erros.equipamentoAtual} id="ns-equipamentoAtual" dica="Patrimônio (etiqueta) ou modelo que será substituído">
                  {input('equipamentoAtual', { placeholder: 'Ex.: TI-0002 ou ThinkPad T14' })}
                </Field>
              )}
            </div>
            <datalist id="dl-deps">{DEPARTAMENTOS.map((x) => <option key={x} value={x} />)}</datalist>
          </section>

          <section className="card form-section" aria-describedby={erros.itens ? 'erro-itens' : undefined}>
            <h2 className="section-title">Equipamentos e acessórios{d.proprietario && <span className="owner-tag ml-8">{d.proprietario}</span>}</h2>
            <p className="muted small mb-8">Marque o que o colaborador vai precisar. Só aparecem itens do estoque da empresa escolhida.</p>
            {erros.itens && <p id="erro-itens" className="field-error picker-erro" role="alert" tabIndex={-1}>{erros.itens}</p>}
            {!d.proprietario ? <p className="muted small">Escolha a empresa acima para ver o que há disponível.</p> : !catalogo ? <Skeleton h={160} /> : (
              <>
                <h3 className="pick-group">Equipamentos com patrimônio</h3>
                <div className="pick-grid">{equipamentos.map(opcao)}</div>
                {acessorios.length > 0 && <h3 className="pick-group">Acessórios e periféricos</h3>}
                <div className="pick-grid">{acessorios.map(opcao)}</div>
              </>
            )}
          </section>

          <section className="card form-section">
            <h2 className="section-title">Entrega</h2>
            <Segmented label="Modalidade de entrega" valor={entrega.modalidade} onChange={(m) => setEntrega((x) => ({ ...x, modalidade: m }))}
              opcoes={[{ id: 'envio', label: 'Enviar para endereço', icone: Truck }, { id: 'retirada', label: 'Retirar em uma unidade', icone: Store }]} />
            {entrega.modalidade === 'envio' ? (
              <div className="form-grid mt-12">
                <Field label="CEP" obrigatorio erro={erros['entrega.cep']} id="ne-cep" dica={buscandoCep ? 'Buscando endereço…' : 'O endereço é preenchido automaticamente'}>
                  <div className="input-icon">
                    {inputE('cep', { inputMode: 'numeric', placeholder: '00000-000', autoComplete: 'postal-code' }, mascaraCep)}
                    {buscandoCep ? <Loader2 size={15} className="spin" aria-hidden="true" /> : <MapPin size={15} aria-hidden="true" />}
                  </div>
                </Field>
                <Field label="Rua / avenida" obrigatorio erro={erros['entrega.logradouro']} id="ne-logradouro">{inputE('logradouro', { autoComplete: 'address-line1' })}</Field>
                <Field label="Número" obrigatorio erro={erros['entrega.numero']} id="ne-numero">{inputE('numero', { placeholder: 'Ex.: 1000 ou s/n' })}</Field>
                <Field label="Complemento" erro={erros['entrega.complemento']} id="ne-complemento">{inputE('complemento', { placeholder: 'Apto, bloco, sala…' })}</Field>
                <Field label="Bairro" obrigatorio erro={erros['entrega.bairro']} id="ne-bairro">{inputE('bairro')}</Field>
                <Field label="Cidade" obrigatorio erro={erros['entrega.cidade']} id="ne-cidade">{inputE('cidade', { autoComplete: 'address-level2' })}</Field>
                <Field label="UF" obrigatorio erro={erros['entrega.uf']} id="ne-uf">
                  <select id="ne-uf" value={entrega.uf} onChange={setE('uf')} aria-invalid={!!erros['entrega.uf']}>
                    <option value="">Selecione</option>
                    {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </Field>
                <Field label="Destinatário" id="ne-destinatario" dica="Em branco = o próprio colaborador">{inputE('destinatario', { placeholder: d.nomeAdmitido || 'Quem vai receber' })}</Field>
                <Field label="Telefone para contato" erro={erros['entrega.telefone']} id="ne-telefone">{inputE('telefone', { inputMode: 'tel', placeholder: '(11) 90000-0000', autoComplete: 'tel' }, mascaraTel)}</Field>
              </div>
            ) : (
              <div className="form-grid mt-12">
                <Field label="Unidade de retirada" obrigatorio erro={erros['entrega.unidade']} wide id="ne-unidade" dica="O colaborador retira os equipamentos com a TI nesta unidade">
                  {inputE('unidade', { list: 'dl-unidades', placeholder: 'Ex.: Matriz · recepção da TI' })}
                </Field>
                <Field label="Telefone para contato" erro={erros['entrega.telefone']} id="ne-telefone">{inputE('telefone', { inputMode: 'tel', placeholder: '(11) 90000-0000' }, mascaraTel)}</Field>
                <datalist id="dl-unidades">{UNIDADES.map((x) => <option key={x} value={x} />)}</datalist>
              </div>
            )}
          </section>

          <section className="card form-section">
            <h2 className="section-title">Observações</h2>
            <Field label="Observações adicionais" erro={erros.observacoes} wide id="ns-observacoes" dica={`${d.observacoes.length}/1000 — softwares, horário de recebimento, ponto de referência…`}>
              <textarea id="ns-observacoes" rows={4} maxLength={1000} value={d.observacoes} onChange={set('observacoes')} />
            </Field>
          </section>
        </div>

        <aside className="form-side">
          <div className="card preview-card">
            <span className="muted small upper">Resumo do pedido</span>
            {escolhidos.length === 0 ? <p className="muted small"><PackageSearch size={14} /> Nenhum item escolhido.</p> : (
              <ul className="resumo-itens">
                {escolhidos.map((c) => (
                  <li key={c.chave}>
                    <CategoriaIcon categoria={c.categoria} size={15} />
                    <span>{c.nome}</span>
                    <strong>×{c.quantidade}</strong>
                    {c.quantidade > c.disponivel && <AlertTriangle size={13} className="txt-amber" aria-label="Sem estoque suficiente" />}
                  </li>
                ))}
              </ul>
            )}
            {faltando.length > 0 && <p className="inline-warn"><AlertTriangle size={14} /> {faltando.map((c) => c.nome).join(', ')}: estoque insuficiente agora. A TI será avisada e pode precisar de mais prazo.</p>}
            {dias !== null && dias >= 0 && (
              <div className={`prazo-box tone-${dias <= 3 ? 'red' : dias <= 7 ? 'amber' : 'green'}`}>
                <CalendarClock size={16} />
                <span>{dias === 0 ? 'Para hoje' : `Faltam ${dias} dia${dias === 1 ? '' : 's'}`}{dias <= 3 ? ' — prazo curto, a TI será alertada.' : dias <= 7 ? ' — prazo apertado.' : ' — prazo confortável.'}</span>
              </div>
            )}
            {d.proprietario && <p className="small muted"><Building2 size={13} /> Estoque da {d.proprietario}</p>}
          </div>
          <div className="form-actions sticky">
            <Link href="/portal" className="btn">Cancelar</Link>
            <button type="submit" className="btn btn-primary" disabled={enviando}><Send size={16} /> {enviando ? 'Enviando…' : 'Enviar solicitação'}</button>
          </div>
        </aside>
      </form>
    </div>
  );
}

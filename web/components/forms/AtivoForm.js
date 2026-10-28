'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Fingerprint, Users, Network, Receipt, StickyNote, X, Save, Building2, ChevronDown } from 'lucide-react';
import { Field, StatusBadge, CategoriaIcon, Badge } from '../ui';
import ColaboradorPicker, { PROPRIETARIOS } from '../ColaboradorPicker';
import { useToast } from '../providers';
import { api } from '@/lib/api';
import { moeda, isoLocal } from '@/lib/format';
import { TOM_STATUS } from '@/lib/constants';

const VAZIO = {
  patrimonio: '', nome: '', categoria: 'Notebook', marca: '', modelo: '', numeroSerie: '', status: 'Disponível', responsavel: '',
  departamento: '', localizacao: '', dataAquisicao: '', valor: '', garantiaAte: '', observacoes: '', hostname: '',
  sistemaOperacional: '', ip: '', fornecedor: '', notaFiscal: '', tags: [], configuracao: '', dataEntradaEstoque: '', proprietario: ''
};
const STATUS = ['Disponível', 'Em uso', 'Em manutenção', 'Descartado'];
const tem = (d, campos) => campos.some((k) => (Array.isArray(d[k]) ? d[k].length : d[k]));

// Formulário do equipamento: o essencial primeiro; rede, compra/garantia e observações ficam em seções recolhíveis
export default function AtivoForm({ inicial, padrao }) {
  const router = useRouter();
  const { toast } = useToast();
  const editando = Boolean(inicial?.id);
  const [d, setD] = useState({ ...VAZIO, ...padrao, ...inicial });
  const [colab, setColab] = useState(inicial?.colaborador ? { colaborador: inicial.colaborador } : null);
  const [erros, setErros] = useState({});
  const [meta, setMeta] = useState(null);
  const [tag, setTag] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [sujo, setSujo] = useState(false);

  useEffect(() => { api.ativos.meta().then(setMeta).catch(() => {}); }, []);
  useEffect(() => {
    if (!sujo) return undefined;
    const h = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [sujo]);

  const set = (k) => (e) => {
    const v = e?.target ? e.target.value : e;
    setD((x) => ({ ...x, [k]: v }));
    setSujo(true);
    if (erros[k]) setErros((er) => ({ ...er, [k]: undefined }));
  };
  const comColaborador = d.status === 'Em uso' || d.status === 'Em manutenção';
  const mudarStatus = (s) => {
    set('status')(s);
    if (s === 'Disponível' || s === 'Descartado') { setColab(null); setD((x) => ({ ...x, responsavel: '' })); }
  };

  const addTag = (t) => {
    const v = t.trim().replace(/,$/, '');
    if (v && !d.tags.includes(v)) set('tags')([...d.tags, v]);
    setTag('');
  };

  const valorAtual = useMemo(() => {
    const vida = meta?.vidaUtil?.[d.categoria] || 5;
    const valor = Number(d.valor) || 0;
    if (!d.dataAquisicao) return valor;
    const meses = Math.max(0, Math.floor((Date.now() - Date.parse(d.dataAquisicao)) / (86400000 * 30.44)));
    return Math.max(0, valor * (1 - meses / (vida * 12)));
  }, [d.valor, d.dataAquisicao, d.categoria, meta]);

  function validarLocal() {
    const e = {};
    if (!d.proprietario) e.proprietario = 'Escolha o proprietário do equipamento.';
    if (!d.patrimonio.trim()) e.patrimonio = 'Informe o número de patrimônio.';
    if (!d.nome.trim()) e.nome = 'Informe o nome do equipamento.';
    if (d.status === 'Em uso' && !colab && !d.responsavel.trim()) e.colaboradorId = 'Escolha o colaborador (ou informe a equipe responsável).';
    if (colab?.novo) {
      if (colab.novo.nome.trim().length < 3) e['novoColaborador.nome'] = 'Informe o nome completo.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(colab.novo.email.trim())) e['novoColaborador.email'] = 'E-mail corporativo inválido.';
    }
    return e;
  }

  async function enviar(e) {
    e.preventDefault();
    const locais = validarLocal();
    if (Object.keys(locais).length) {
      setErros(locais);
      setTimeout(() => document.querySelector('[aria-invalid="true"]')?.focus(), 30);
      return;
    }
    setSalvando(true);
    try {
      const payload = { ...d, colaboradorId: colab?.colaborador?.id || null, ...(colab?.novo ? { novoColaborador: colab.novo } : {}) };
      const salvo = editando ? await api.ativos.atualizar(inicial.id, payload) : await api.ativos.criar(payload);
      setSujo(false);
      toast({ tipo: 'sucesso', titulo: editando ? 'Alterações salvas' : 'Equipamento cadastrado', msg: `${salvo.patrimonio} · ${salvo.proprietario}` });
      router.push(`/ativos/${salvo.id}`);
    } catch (err) {
      setErros(err.campos || {});
      toast({ tipo: 'erro', titulo: 'Verifique o formulário', msg: err.message });
      setTimeout(() => document.querySelector('[aria-invalid="true"]')?.focus(), 50);
      setSalvando(false);
    }
  }

  const input = (k, props = {}) => (
    <input id={`f-${k}`} value={d[k] ?? ''} onChange={set(k)} aria-invalid={!!erros[k]} {...props} />
  );
  // Função (e não componente) para não remontar os campos a cada tecla
  const secao = (I, titulo, campos, conteudo) => (
    <details className="card form-section form-details" open={(editando && tem(d, campos)) || campos.some((k) => erros[k]) || undefined}>
      <summary><span className="section-title"><I size={18} /> {titulo}</span><span className="muted small">{tem(d, campos) ? 'preenchido' : 'opcional'}</span><ChevronDown size={16} className="chev" aria-hidden="true" /></summary>
      <div className="form-details-body">{conteudo}</div>
    </details>
  );

  return (
    <form className="form-layout" onSubmit={enviar} noValidate>
      <div className="form-main">
        <section className="card form-section">
          <h2 className="section-title"><Building2 size={18} /> Proprietário do equipamento <span className="req" aria-hidden="true">*</span></h2>
          <div className="owner-pick" role="radiogroup" aria-label="Proprietário do equipamento">
            {PROPRIETARIOS.map((p) => (
              <button key={p} type="button" role="radio" aria-checked={d.proprietario === p} aria-invalid={!!erros.proprietario} className={`owner-opt ${d.proprietario === p ? 'on' : ''}`}
                onClick={() => set('proprietario')(p)} disabled={Boolean(editando && inicial?.reserva && d.proprietario !== p)}>
                <strong>{p}</strong><small>{p === 'H&CO' ? 'Estoque da H&CO' : 'Estoque da H&CO B2Finance'}</small>
              </button>
            ))}
          </div>
          {erros.proprietario && <p className="field-error" role="alert">{erros.proprietario}</p>}
          {editando && inicial?.reserva && <p className="muted small">Reservado para uma solicitação: o proprietário não pode ser trocado agora.</p>}
        </section>

        <section className="card form-section">
          <h2 className="section-title"><Fingerprint size={18} /> Identificação</h2>
          <div className="form-grid">
            <Field label="Nº de patrimônio" obrigatorio erro={erros.patrimonio} id="f-patrimonio">{input('patrimonio', { placeholder: 'TI-0017', className: 'mono' })}</Field>
            <Field label="Categoria" obrigatorio erro={erros.categoria} id="f-categoria">
              <select id="f-categoria" value={d.categoria} onChange={set('categoria')}>{(meta?.categorias || [d.categoria]).map((c) => <option key={c}>{c}</option>)}</select>
            </Field>
            <Field label="Nome do equipamento" obrigatorio erro={erros.nome} wide id="f-nome">{input('nome', { placeholder: 'Ex.: Notebook Dell Latitude 5440' })}</Field>
            <Field label="Marca" id="f-marca">{input('marca', { list: 'dl-marcas' })}</Field>
            <Field label="Modelo" id="f-modelo">{input('modelo')}</Field>
            <Field label="Número de série" id="f-numeroSerie">{input('numeroSerie', { className: 'mono' })}</Field>
            <Field label="Configuração" erro={erros.configuracao} id="f-configuracao" dica={d.categoria === 'Notebook' ? 'Aparece para o RH no estoque (sem patrimônio)' : undefined}>
              {input('configuracao', { placeholder: 'i5 · 16 GB · SSD 512 GB', maxLength: 200 })}
            </Field>
          </div>
        </section>

        <section className="card form-section">
          <h2 className="section-title"><Users size={18} /> Alocação</h2>
          <div className="form-grid">
            <Field label="Status" obrigatorio wide>
              <div className="chip-select" role="radiogroup" aria-label="Status">
                {STATUS.map((s) => (
                  <button key={s} type="button" role="radio" aria-checked={d.status === s} className={`chip tone-${TOM_STATUS[s]} ${d.status === s ? 'on' : ''}`}
                    onClick={() => mudarStatus(s)} disabled={Boolean(editando && inicial?.reserva && s !== inicial.status)}>{s}</button>
                ))}
              </div>
            </Field>
            {comColaborador && (
              <Field label="Colaborador" obrigatorio={d.status === 'Em uso' && !d.responsavel} wide id="colab-ativo" dica="Busque pelo nome ou e-mail corporativo. Se ainda não existir, cadastre na hora.">
                <ColaboradorPicker id="colab-ativo" valor={colab} onChange={(v) => { setColab(v); setSujo(true); setErros((er) => ({ ...er, colaboradorId: undefined })); }} erros={erros} empresaPadrao={d.proprietario || 'H&CO'} />
              </Field>
            )}
            {comColaborador && !colab && (
              <Field label="Ou equipe / área responsável" erro={erros.responsavel} id="f-responsavel" dica="Para uso coletivo (ex.: Equipe de Infraestrutura)">{input('responsavel', { list: 'dl-resp' })}</Field>
            )}
            <Field label="Departamento" id="f-departamento">{input('departamento', { list: 'dl-deps' })}</Field>
            <Field label="Localização" id="f-localizacao">{input('localizacao', { placeholder: 'Ex.: Almoxarifado TI · Barueri' })}</Field>
          </div>
        </section>

        {secao(Network, 'Rede e sistema', ['hostname', 'ip', 'sistemaOperacional'], (
          <div className="form-grid three">
            <Field label="Hostname" id="f-hostname">{input('hostname', { className: 'mono', placeholder: 'NB-FIN-001' })}</Field>
            <Field label="Endereço IP" erro={erros.ip} id="f-ip">{input('ip', { className: 'mono', placeholder: '10.10.0.25', inputMode: 'decimal' })}</Field>
            <Field label="Sistema operacional" id="f-sistemaOperacional">{input('sistemaOperacional', { list: 'dl-so' })}</Field>
          </div>
        ))}

        {secao(Receipt, 'Compra e garantia', ['dataAquisicao', 'valor', 'garantiaAte', 'fornecedor', 'notaFiscal', 'dataEntradaEstoque'], (
          <div className="form-grid three">
            <Field label="Data de aquisição" erro={erros.dataAquisicao} id="f-dataAquisicao">{input('dataAquisicao', { type: 'date', max: isoLocal() })}</Field>
            <Field label="Valor de compra (R$)" erro={erros.valor} id="f-valor">{input('valor', { type: 'number', step: '0.01', min: '0', placeholder: '0,00' })}</Field>
            <Field label="Garantia até" erro={erros.garantiaAte} id="f-garantiaAte">{input('garantiaAte', { type: 'date' })}</Field>
            <Field label="Fornecedor" id="f-fornecedor">{input('fornecedor', { list: 'dl-forn' })}</Field>
            <Field label="Nota fiscal" id="f-notaFiscal">{input('notaFiscal')}</Field>
            <Field label="Entrada no estoque" erro={erros.dataEntradaEstoque} id="f-dataEntradaEstoque" dica="Se vazio, usa a data de aquisição">{input('dataEntradaEstoque', { type: 'date', max: isoLocal() })}</Field>
          </div>
        ))}

        {secao(StickyNote, 'Observações e tags', ['observacoes', 'tags'], (
          <div className="form-grid">
            <Field label="Tags" id="f-tags" wide dica="Enter ou vírgula para adicionar">
              <div className="tag-input">
                {d.tags.map((t) => (
                  <span key={t} className="tag">{t}<button type="button" onClick={() => set('tags')(d.tags.filter((x) => x !== t))} aria-label={`Remover tag ${t}`}><X size={12} /></button></span>
                ))}
                <input id="f-tags" value={tag} list="dl-tags" onChange={(e) => (e.target.value.endsWith(',') ? addTag(e.target.value) : setTag(e.target.value))}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(tag); } if (e.key === 'Backspace' && !tag && d.tags.length) set('tags')(d.tags.slice(0, -1)); }}
                  onBlur={() => tag && addTag(tag)} placeholder={d.tags.length ? '' : 'Crítico, VIP…'} />
              </div>
            </Field>
            <Field label="Observações" id="f-observacoes" wide>
              <textarea id="f-observacoes" rows={3} value={d.observacoes} onChange={set('observacoes')} placeholder="Informações úteis para a equipe…" />
            </Field>
          </div>
        ))}

        <datalist id="dl-resp">{meta?.responsaveis.map((x) => <option key={x} value={x} />)}</datalist>
        <datalist id="dl-deps">{meta?.departamentos.map((x) => <option key={x} value={x} />)}</datalist>
        <datalist id="dl-so">{meta?.sistemas.map((x) => <option key={x} value={x} />)}</datalist>
        <datalist id="dl-forn">{meta?.fornecedores.map((x) => <option key={x} value={x} />)}</datalist>
        <datalist id="dl-tags">{meta?.tags.map((x) => <option key={x} value={x} />)}</datalist>
        <datalist id="dl-marcas">{['Apple', 'Dell', 'HP', 'Lenovo', 'Samsung', 'LG', 'Cisco', 'Fortinet', 'Brother', 'Jabra', 'Logitech'].map((x) => <option key={x} value={x} />)}</datalist>
      </div>

      <aside className="form-side">
        <div className="card preview-card">
          <span className="muted small upper">Resumo</span>
          <div className="preview-head">
            <CategoriaIcon categoria={d.categoria} boxed size={22} />
            <div><strong>{d.nome || 'Nome do equipamento'}</strong><small className="mono muted">{d.patrimonio || 'TI-0000'}</small></div>
          </div>
          <div className="badge-row"><StatusBadge status={d.status} />{d.proprietario ? <Badge tom="slate">{d.proprietario}</Badge> : <Badge tom="amber">Sem proprietário</Badge>}</div>
          {(colab?.colaborador || colab?.novo) && <p className="small"><strong>{colab.colaborador?.nome || colab.novo.nome || 'Novo colaborador'}</strong><br /><span className="muted">{colab.colaborador?.email || colab.novo.email}</span></p>}
          {Number(d.valor) > 0 && <div className="row-between small"><span className="muted">Valor atual estimado</span><strong>{moeda(valorAtual)}</strong></div>}
        </div>
        <div className="form-actions sticky">
          <Link href={editando ? `/ativos/${inicial.id}` : '/ativos'} className="btn">Cancelar</Link>
          <button type="submit" className="btn btn-primary" disabled={salvando}><Save size={16} /> {salvando ? 'Salvando…' : editando ? 'Salvar' : 'Cadastrar'}</button>
        </div>
      </aside>
    </form>
  );
}

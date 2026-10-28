'use client';

// Formulário de troca de senha com a política exibida em tempo real (a API valida de novo).
import { useState } from 'react';
import { Check, X, Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react';
import { Field } from '../ui';
import { useAuth } from '../auth';
import { useToast } from '../providers';
import { api } from '@/lib/api';

// Mesmos requisitos da API (auth.js → REQUISITOS_SENHA)
export const REQUISITOS = [
  { id: 'tamanho', texto: 'Pelo menos 10 caracteres', ok: (s) => s.length >= 10 },
  { id: 'maiuscula', texto: 'Uma letra maiúscula', ok: (s) => /[A-ZÀ-Ý]/.test(s) },
  { id: 'minuscula', texto: 'Uma letra minúscula', ok: (s) => /[a-zß-ÿ]/.test(s) },
  { id: 'numero', texto: 'Um número', ok: (s) => /\d/.test(s) },
  { id: 'simbolo', texto: 'Um símbolo (ex.: ! @ # $ %)', ok: (s) => /[^A-Za-zÀ-ÿ0-9\s]/.test(s) }
];

export function Requisitos({ senha }) {
  return (
    <ul className="pw-req" aria-label="Requisitos da senha">
      {REQUISITOS.map((r) => {
        const ok = r.ok(senha);
        return <li key={r.id} className={ok ? 'ok' : ''}>{ok ? <Check size={13} aria-hidden="true" /> : <X size={13} aria-hidden="true" />}<span>{r.texto}</span><span className="sr-only">{ok ? ' — atendido' : ' — pendente'}</span></li>;
      })}
    </ul>
  );
}

export default function SenhaForm({ aoConcluir, compacto = false, rotuloBotao = 'Alterar senha' }) {
  const { usarSessao } = useAuth();
  const { toast } = useToast();
  const [d, setD] = useState({ atual: '', nova: '', confirmacao: '' });
  const [erros, setErros] = useState({});
  const [ver, setVer] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const set = (k) => (e) => { setD((x) => ({ ...x, [k]: e.target.value })); setErros((x) => ({ ...x, [k]: undefined })); };
  const politicaOk = REQUISITOS.every((r) => r.ok(d.nova));

  async function salvar(e) {
    e.preventDefault();
    const c = {};
    if (!d.atual) c.atual = 'Informe a senha atual.';
    if (!politicaOk) c.nova = 'A nova senha não atende aos requisitos.';
    else if (d.nova === d.atual) c.nova = 'A nova senha precisa ser diferente da atual.';
    if (d.confirmacao !== d.nova) c.confirmacao = 'As senhas não conferem.';
    if (Object.keys(c).length) { setErros(c); return; }
    setEnviando(true);
    try {
      const r = await api.auth.trocarSenha(d.atual, d.nova, d.confirmacao);
      usarSessao(r.token, r.usuario);
      setD({ atual: '', nova: '', confirmacao: '' });
      setErros({});
      toast({ tipo: 'sucesso', titulo: 'Senha alterada', msg: 'As sessões abertas em outros dispositivos foram encerradas.' });
      aoConcluir?.(r.usuario);
    } catch (err) {
      setErros(err.campos || {});
      toast({ tipo: 'erro', titulo: 'Não foi possível alterar a senha', msg: err.message });
    } finally {
      setEnviando(false);
    }
  }

  const tipo = ver ? 'text' : 'password';
  return (
    <form className={`senha-form ${compacto ? 'compacto' : ''}`} onSubmit={salvar} noValidate>
      <Field label="Senha atual" erro={erros.atual} id="pw-atual" obrigatorio>
        <input id="pw-atual" type={tipo} autoComplete="current-password" value={d.atual} onChange={set('atual')} aria-invalid={!!erros.atual} />
      </Field>
      <Field label="Nova senha" erro={erros.nova} id="pw-nova" obrigatorio>
        <div className="auth-input">
          <KeyRound size={16} aria-hidden="true" />
          <input id="pw-nova" type={tipo} autoComplete="new-password" value={d.nova} onChange={set('nova')} aria-invalid={!!erros.nova} aria-describedby="pw-req" />
          <button type="button" className="icon-btn ghost sm" onClick={() => setVer((v) => !v)} aria-label={ver ? 'Ocultar senhas' : 'Mostrar senhas'}>{ver ? <EyeOff size={16} /> : <Eye size={16} />}</button>
        </div>
      </Field>
      <div id="pw-req"><Requisitos senha={d.nova} /></div>
      <Field label="Confirmar nova senha" erro={erros.confirmacao} id="pw-conf" obrigatorio>
        <input id="pw-conf" type={tipo} autoComplete="new-password" value={d.confirmacao} onChange={set('confirmacao')} aria-invalid={!!erros.confirmacao} />
      </Field>
      <button type="submit" className={`btn btn-primary ${compacto ? '' : 'btn-lg'}`} disabled={enviando}>
        {enviando ? <Loader2 size={16} className="spin" /> : <KeyRound size={16} />} {rotuloBotao}
      </button>
    </form>
  );
}

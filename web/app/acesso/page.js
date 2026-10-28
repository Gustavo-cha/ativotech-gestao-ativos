'use client';

// Etapa 1 do acesso: empresa (prefixo) e portal — Solicitante (RH) ou Operador (TI).
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Building2, ClipboardList, Wrench, ChevronRight, Loader2, AlertCircle, Info, CheckCircle2 } from 'lucide-react';
import AuthLayout from '@/components/auth/AuthLayout';
import { api } from '@/lib/api';
import { lerAcesso, salvarAcesso, voltarSeguro, PORTAIS } from '@/lib/acesso';

const ERROS = {
  acesso_invalido: 'Escolha a empresa e o portal para continuar.',
  microsoft_expirado: 'O login com a Microsoft expirou ou já foi usado. Tente novamente.'
};

function Acesso() {
  const router = useRouter();
  const params = useSearchParams();
  const [prefixo, setPrefixo] = useState('');
  const [erro, setErro] = useState(ERROS[params.get('erro')] || '');
  const [validando, setValidando] = useState('');
  const [empresa, setEmpresa] = useState(null);

  // Enter no campo: só confere o prefixo e mostra a empresa reconhecida
  async function conferir() {
    const p = prefixo.trim();
    if (!p) { setErro('Informe o prefixo da sua empresa.'); return; }
    try { const r = await api.auth.empresa(p); setEmpresa(r); setErro(''); }
    catch (e) { setEmpresa(null); setErro(e.status === 404 ? 'Prefixo não encontrado. Verifique o nome da empresa ou fale com o suporte de TI.' : e.message); }
  }

  useEffect(() => { setPrefixo(lerAcesso().prefixo || ''); }, []);

  async function escolher(perfil) {
    const p = prefixo.trim();
    if (!p) { setErro('Informe o prefixo da sua empresa.'); document.getElementById('ac-prefixo')?.focus(); return; }
    setValidando(perfil);
    setErro('');
    try {
      const r = await api.auth.empresa(p);
      salvarAcesso({ prefixo: r.prefixo, perfil });
      const voltar = voltarSeguro(params.get('voltar'));
      router.push(`/login?perfil=${perfil}${voltar ? `&voltar=${encodeURIComponent(voltar)}` : ''}`);
    } catch (e) {
      setErro(e.status === 404 ? 'Prefixo não encontrado. Verifique o nome da empresa ou fale com o suporte de TI.' : e.message);
      setValidando('');
    }
  }

  const Opcao = ({ perfil, icone: I, tom }) => (
    <button type="button" className={`auth-opcao tone-${tom}`} onClick={() => escolher(perfil)} disabled={Boolean(validando)}>
      <span className="auth-opcao-icone"><I size={22} aria-hidden="true" /></span>
      <span className="auth-opcao-texto">
        <strong>Acessar como {PORTAIS[perfil].sub}</strong>
        <small>{PORTAIS[perfil].desc}</small>
      </span>
      {validando === perfil ? <Loader2 size={18} className="spin" aria-hidden="true" /> : <ChevronRight size={18} aria-hidden="true" />}
    </button>
  );

  return (
    <div className="auth-card">
      <header className="auth-card-head">
        <span className="auth-etapa">Etapa 1 de 2</span>
        <h1>Acesse o Ativos Tech</h1>
        <p className="muted">Informe o prefixo da sua empresa e escolha como deseja entrar.</p>
      </header>

      <form className="auth-form" onSubmit={(e) => { e.preventDefault(); conferir(); }} noValidate>
        <div className={`field ${erro ? 'has-error' : ''}`}>
          <label htmlFor="ac-prefixo">Prefixo da empresa</label>
          <div className="auth-input">
            <Building2 size={17} aria-hidden="true" />
            {empresa && <CheckCircle2 size={17} className="auth-input-ok" aria-label={`Empresa reconhecida: ${empresa.nome}`} />}
            <input id="ac-prefixo" value={prefixo} onChange={(e) => { setPrefixo(e.target.value); setErro(''); setEmpresa(null); }} onBlur={() => prefixo.trim() && !empresa && conferir()} placeholder="Ex.: H&CO"
              autoComplete="organization" autoCapitalize="characters" spellCheck={false} aria-invalid={Boolean(erro)} aria-describedby={erro ? 'ac-erro' : 'ac-dica'} autoFocus />
          </div>
          {erro ? <p className="field-error" id="ac-erro" role="alert"><AlertCircle size={14} /> {erro}</p>
            : <p className="field-hint" id="ac-dica">{empresa ? <>Empresa reconhecida: <strong>{empresa.nome}</strong>. Agora escolha o portal.</> : 'O prefixo identifica a sua empresa. Ele fica salvo neste navegador.'}</p>}
        </div>
      </form>

      <div className="auth-opcoes" role="group" aria-label="Escolha o portal de acesso">
        <Opcao perfil="rh" icone={ClipboardList} tom="green" />
        <Opcao perfil="ti" icone={Wrench} tom="blue" />
      </div>

      <p className="auth-nota"><Info size={14} aria-hidden="true" /> Não sabe o prefixo ou não tem acesso? Fale com a equipe de TI — os acessos são criados por um Operador administrador.</p>
    </div>
  );
}

export default function PaginaAcesso() {
  return <AuthLayout><Suspense fallback={null}><Acesso /></Suspense></AuthLayout>;
}

'use client';

// Etapa 2 do acesso: login no portal escolhido — conta Microsoft ou e-mail e senha.
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { LogIn, Eye, EyeOff, Loader2, ArrowLeft, ClipboardList, Wrench, Building2, AlertCircle, Info, KeyRound, Mail, Lock } from 'lucide-react';
import AuthLayout from '@/components/auth/AuthLayout';
import { useAuth } from '@/components/auth';
import { useToast } from '@/components/providers';
import { Field } from '@/components/ui';
import { api } from '@/lib/api';
import { lerAcesso, salvarAcesso, voltarSeguro, lerMotivoSaida, PORTAIS } from '@/lib/acesso';
import { inicioDoUsuario, rotaPermitida } from '@/lib/nav';

const ERROS_MS = {
  microsoft_indisponivel: 'O login com a conta Microsoft ainda não está disponível. Use e-mail e senha.',
  microsoft_cancelado: 'O login com a Microsoft foi cancelado.',
  microsoft_nao_cadastrado: 'Esta conta Microsoft não está cadastrada no Ativos Tech. Peça o acesso a um Operador administrador.',
  microsoft_falhou: 'Não foi possível concluir o login com a Microsoft. Tente novamente.'
};

const LogoMicrosoft = () => (
  <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true"><rect x="1" y="1" width="9" height="9" fill="#f25022" /><rect x="11" y="1" width="9" height="9" fill="#7fba00" /><rect x="1" y="11" width="9" height="9" fill="#00a4ef" /><rect x="11" y="11" width="9" height="9" fill="#ffb900" /></svg>
);

function Login() {
  const router = useRouter();
  const params = useSearchParams();
  const { login } = useAuth();
  const { toast } = useToast();
  const perfil = ['ti', 'rh'].includes(params.get('perfil')) ? params.get('perfil') : null;
  const voltar = voltarSeguro(params.get('voltar'));
  const [prefixo, setPrefixo] = useState(null);
  const [metodos, setMetodos] = useState(null);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [ver, setVer] = useState(false);
  const [erro, setErro] = useState('');
  const [outroPortal, setOutroPortal] = useState(null);
  const [campos, setCampos] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [ajudaSenha, setAjudaSenha] = useState(false);

  // Sem empresa ou portal escolhidos: volta para a etapa 1
  useEffect(() => {
    const a = lerAcesso();
    if (!perfil || !a.prefixo) { router.replace(`/acesso${voltar ? `?voltar=${encodeURIComponent(voltar)}` : ''}`); return; }
    setPrefixo(a.prefixo);
    salvarAcesso({ perfil });
    const e = params.get('erro');
    setErro(e === 'microsoft_negado' ? (params.get('mensagem') || 'Acesso não autorizado.') : ERROS_MS[e] || lerMotivoSaida());
    api.auth.metodos().then(setMetodos).catch(() => setMetodos({ senha: true, microsoft: { configurado: false, mensagem: 'Não foi possível verificar o login Microsoft.' } }));
  }, [perfil, params, router, voltar]);

  async function entrar(e) {
    e.preventDefault();
    const c = {};
    if (!email.trim()) c.email = 'Informe o e-mail.';
    if (!senha) c.senha = 'Informe a senha.';
    if (Object.keys(c).length) { setCampos(c); return; }
    setEnviando(true);
    setErro('');
    setCampos({});
    setOutroPortal(null);
    try {
      const u = await login(email, senha, prefixo, perfil);
      if (!u.trocarSenha) toast({ tipo: 'sucesso', titulo: `Bem-vindo(a), ${u.nome.split(' ')[0]}!`, msg: u.perfilNome });
      router.replace(u.trocarSenha ? '/trocar-senha' : voltar && rotaPermitida(voltar, u) ? voltar : inicioDoUsuario(u));
    } catch (err) {
      setErro(err.message);
      setCampos(err.campos || {});
      if (err.campos?.perfilCorreto) setOutroPortal(err.campos.perfilCorreto);
      setEnviando(false);
    }
  }

  function microsoft() {
    if (!metodos?.microsoft?.configurado) { setErro(metodos?.microsoft?.mensagem || ERROS_MS.microsoft_indisponivel); return; }
    window.location.assign(api.auth.microsoftUrl(prefixo, perfil, voltar));
  }

  if (!perfil || !prefixo) return null;
  const P = PORTAIS[perfil];
  const IconePortal = perfil === 'ti' ? Wrench : ClipboardList;
  const msOk = metodos?.microsoft?.configurado;

  return (
    <div className="auth-card">
      <Link href={`/acesso${voltar ? `?voltar=${encodeURIComponent(voltar)}` : ''}`} className="auth-voltar"><ArrowLeft size={15} /> Trocar empresa ou portal</Link>
      <div className={`auth-portal tone-${perfil === 'ti' ? 'blue' : 'green'}`}>
        <span className="auth-portal-icone"><IconePortal size={18} aria-hidden="true" /></span>
        <span><strong>{P.titulo}</strong><small>{P.sub}</small></span>
        <span className="auth-empresa" title="Empresa"><Building2 size={13} aria-hidden="true" /> {prefixo}</span>
      </div>

      <header className="auth-card-head">
        <span className="auth-etapa">Etapa 2 de 2</span>
        <h1>Entrar</h1>
      </header>

      {erro && (
        <div className="alert alert-error auth-alerta" role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          <span>{erro}{outroPortal && <> <button type="button" className="link-btn" onClick={() => router.push(`/login?perfil=${outroPortal}`)}>Ir para o {PORTAIS[outroPortal].titulo}</button></>}</span>
        </div>
      )}

      <button type="button" className={`btn btn-lg auth-ms ${msOk ? '' : 'indisponivel'}`} onClick={microsoft} disabled={!metodos} aria-describedby={metodos && !msOk ? 'ms-indisponivel' : undefined}>
        <LogoMicrosoft /> Entrar com a Microsoft
      </button>
      {metodos && !msOk && <p className="auth-nota compacta" id="ms-indisponivel"><Info size={13} aria-hidden="true" /> Login com conta Microsoft ainda não configurado.</p>}

      <div className="auth-divisor"><span>ou com e-mail e senha</span></div>

      <form className="auth-form" onSubmit={entrar} noValidate>
        <Field label="E-mail corporativo" erro={campos.email} id="login-email">
          <div className="auth-input">
            <Mail size={17} aria-hidden="true" />
            <input id="login-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!campos.email} placeholder="nome@hco.com" autoFocus />
          </div>
        </Field>
        <Field label="Senha" erro={campos.senha} id="login-senha">
          <div className="auth-input">
            <Lock size={17} aria-hidden="true" />
            <input id="login-senha" type={ver ? 'text' : 'password'} autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} aria-invalid={!!campos.senha} />
            <button type="button" className="icon-btn ghost sm" onClick={() => setVer((v) => !v)} aria-label={ver ? 'Ocultar senha' : 'Mostrar senha'}>{ver ? <EyeOff size={16} /> : <Eye size={16} />}</button>
          </div>
        </Field>
        <button type="button" className="link-btn auth-esqueci" onClick={() => setAjudaSenha((v) => !v)} aria-expanded={ajudaSenha}><KeyRound size={13} /> Esqueci a senha</button>
        {ajudaSenha && <p className="auth-nota"><Info size={14} aria-hidden="true" /> Por segurança, a senha é redefinida por um Operador administrador do Ativos Tech. Ele gera uma senha temporária, e você cria a sua no próximo acesso.</p>}
        <button type="submit" className="btn btn-primary btn-lg" disabled={enviando || !prefixo}>
          {enviando ? <Loader2 size={17} className="spin" /> : <LogIn size={17} />} {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}

export default function PaginaLogin() {
  return <AuthLayout><Suspense fallback={null}><Login /></Suspense></AuthLayout>;
}

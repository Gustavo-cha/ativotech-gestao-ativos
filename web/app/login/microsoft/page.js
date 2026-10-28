'use client';

// Retorno do login Microsoft: troca o código de uso único (que veio no fragmento # da URL) pela sessão.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, AlertCircle } from 'lucide-react';
import AuthLayout from '@/components/auth/AuthLayout';
import { useAuth } from '@/components/auth';
import { api } from '@/lib/api';
import { voltarSeguro } from '@/lib/acesso';
import { inicioDoUsuario, rotaPermitida } from '@/lib/nav';

export default function RetornoMicrosoft() {
  const router = useRouter();
  const { usarSessao } = useAuth();
  const [erro, setErro] = useState('');
  const feito = useRef(false);

  useEffect(() => {
    if (feito.current) return;
    feito.current = true;
    const frag = new URLSearchParams(window.location.hash.slice(1));
    // Remove o código da barra de endereços e do histórico
    window.history.replaceState(null, '', window.location.pathname);
    const codigo = frag.get('codigo');
    if (!codigo) { setErro('Código de acesso ausente. Entre novamente.'); return; }
    api.auth.microsoftTrocar(codigo).then((r) => {
      usarSessao(r.token, r.usuario);
      const voltar = voltarSeguro(frag.get('voltar'));
      router.replace(voltar && rotaPermitida(voltar, r.usuario) ? voltar : inicioDoUsuario(r.usuario));
    }).catch((e) => setErro(e.message));
  }, [router, usarSessao]);

  return (
    <AuthLayout>
      <div className="auth-card auth-centro">
        {erro ? (
          <>
            <div className="alert alert-error auth-alerta" role="alert"><AlertCircle size={16} /> <span>{erro}</span></div>
            <Link href="/acesso" className="btn btn-primary btn-lg">Voltar ao início</Link>
          </>
        ) : (
          <p className="auth-carregando" role="status"><Loader2 size={20} className="spin" /> Concluindo o login com a Microsoft…</p>
        )}
      </div>
    </AuthLayout>
  );
}

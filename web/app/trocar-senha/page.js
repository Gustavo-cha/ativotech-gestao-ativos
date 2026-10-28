'use client';

// Troca obrigatória da senha temporária (primeiro acesso ou senha redefinida pelo administrador).
import { useRouter } from 'next/navigation';
import { ShieldCheck, LogOut } from 'lucide-react';
import AuthLayout from '@/components/auth/AuthLayout';
import SenhaForm from '@/components/auth/SenhaForm';
import { useAuth } from '@/components/auth';
import { inicioDoUsuario } from '@/lib/nav';

export default function TrocarSenha() {
  const router = useRouter();
  const { usuario, logout } = useAuth();
  if (!usuario) return null;
  return (
    <AuthLayout>
      <div className="auth-card">
        <header className="auth-card-head">
          <span className="auth-etapa"><ShieldCheck size={13} /> Primeiro acesso</span>
          <h1>Crie a sua senha</h1>
          <p className="muted">Olá, {usuario.nome.split(' ')[0]}. Você entrou com uma senha temporária. Defina uma senha pessoal para continuar — as outras sessões serão encerradas.</p>
        </header>
        <SenhaForm rotuloBotao="Salvar e continuar" aoConcluir={(u) => router.replace(inicioDoUsuario(u))} />
        <button type="button" className="link-btn auth-sair" onClick={async () => { await logout(); router.replace('/acesso'); }}><LogOut size={14} /> Sair</button>
      </div>
    </AuthLayout>
  );
}

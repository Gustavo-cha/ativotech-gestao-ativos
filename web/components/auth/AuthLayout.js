'use client';

import { Boxes, Warehouse, Truck, ShieldCheck } from 'lucide-react';
import IlustracaoInfra from './Ilustracao';

const Marca = () => (
  <span className="brand-mark" aria-hidden="true">
    <svg viewBox="0 0 24 24" width="22" height="22"><path d="M4 7l8-4 8 4-8 4-8-4z" fill="currentColor" /><path d="M4 12l8 4 8-4M4 17l8 4 8-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" opacity=".7" /></svg>
  </span>
);

// Estrutura das telas de acesso: vitrine visual (sempre escura) + painel do formulário (segue o tema)
export default function AuthLayout({ children }) {
  return (
    <div className="auth">
      <section className="auth-vitrine" aria-label="Ativos Tech">
        <div className="auth-vitrine-top">
          <div className="auth-marca"><Marca /><span><strong>Ativos Tech</strong><small>Gestão de ativos e logística de TI</small></span></div>
          <span className="auth-tag"><ShieldCheck size={14} aria-hidden="true" /> Acesso corporativo</span>
        </div>
        <div className="auth-arte"><IlustracaoInfra /></div>
        <div className="auth-vitrine-texto">
          <h2>Infraestrutura e equipamentos de TI sob controle.</h2>
          <p>Inventário, estoque, solicitações e envios em uma única plataforma — com acesso por perfil e licença.</p>
          <ul className="auth-pilares">
            <li><Boxes size={16} aria-hidden="true" /> Inventário</li>
            <li><Warehouse size={16} aria-hidden="true" /> Estoque</li>
            <li><Truck size={16} aria-hidden="true" /> Envios</li>
          </ul>
        </div>
      </section>
      <main className="auth-painel">
        <div className="auth-marca-mobile"><Marca /><strong>Ativos Tech</strong></div>
        {children}
        <p className="auth-rodape">© {new Date().getFullYear()} Ativos Tech · Uso restrito a usuários autorizados</p>
      </main>
    </div>
  );
}

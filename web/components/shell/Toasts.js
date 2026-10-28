'use client';

import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import { useToast } from '../providers';

const ICON = { sucesso: CheckCircle2, erro: XCircle, aviso: AlertTriangle, info: Info };

export default function Toasts() {
  const { toasts, fecharToast, removerToast } = useToast();
  return (
    <div className="toasts" aria-live="polite" aria-atomic="false">
      {toasts.map((t) => {
        const I = t.icone || ICON[t.tipo] || Info;
        return (
          <div key={t.id} className={`toast toast-${t.tipo} ${t.classe || ''} ${t.saindo ? 'out' : ''}`} role={t.tipo === 'erro' ? 'alert' : 'status'}
            onAnimationEnd={() => t.saindo && removerToast(t.id)}>
            <I size={20} className="toast-icon" aria-hidden="true" />
            <div className="toast-body">
              <strong>{t.titulo}</strong>
              {t.msg && <p>{t.msg}</p>}
              {t.acao && <button type="button" className="link-btn" onClick={() => { t.acao.onClick(); fecharToast(t.id); }}>{t.acao.label}</button>}
            </div>
            <button type="button" className="toast-x" onClick={() => fecharToast(t.id)} aria-label="Fechar"><X size={15} /></button>
            <span className="toast-timer" style={{ animationDuration: `${t.duracao}ms` }} />
          </div>
        );
      })}
    </div>
  );
}

'use client';

// Aviso administrativo: notificações por e-mail sem serviço configurado (ou com falhas na fila).
import Link from 'next/link';
import { MailWarning, ArrowRight } from 'lucide-react';
import { useAuth } from './auth';
import { useApi } from '@/lib/hooks';
import { api } from '@/lib/api';

export default function AvisoEmail({ compacto = false }) {
  const { pode } = useAuth();
  const admin = pode('notificacoes:gerenciar');
  const { data } = useApi(() => (admin ? api.notificacoes.status() : Promise.resolve(null)), [admin]);
  if (!data) return null;
  const falhas = (data.contagem?.falhou || 0) + (data.contagem?.nao_configurado || 0);
  if (data.configurado && !data.contagem?.falhou) return null;
  return (
    <div className={`aviso-email ${data.configurado ? 'tone-amber' : 'tone-red'}`} role="status">
      <MailWarning size={18} aria-hidden="true" />
      <div>
        <strong>{data.configurado ? `${data.contagem.falhou} notificação(ões) por e-mail falharam` : 'Envio de e-mails não configurado'}</strong>
        {!compacto && <span className="small">{data.configurado ? 'Verifique o servidor e reenvie pela fila.' : `As notificações de solicitações não estão sendo enviadas${falhas ? ` (${falhas} aguardando)` : ''}. Configure SMTP ou Microsoft Graph na API.`}</span>}
      </div>
      <Link href="/notificacoes" className="btn btn-sm">Ver detalhes <ArrowRight size={14} /></Link>
    </div>
  );
}

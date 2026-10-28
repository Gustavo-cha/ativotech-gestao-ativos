'use client';

import { useParams } from 'next/navigation';
import SolicitacaoDetalhe from '@/components/portal/SolicitacaoDetalhe';

export default function DetalheTI() {
  const { id } = useParams();
  return <SolicitacaoDetalhe id={id} voltar={{ href: '/solicitacoes', label: 'Voltar ao painel de solicitações' }} />;
}

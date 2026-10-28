'use client';

import { useParams } from 'next/navigation';
import SolicitacaoDetalhe from '@/components/portal/SolicitacaoDetalhe';

export default function DetalheRH() {
  const { id } = useParams();
  return <SolicitacaoDetalhe id={id} voltar={{ href: '/portal/solicitacoes', label: 'Voltar às solicitações' }} />;
}

'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Pencil } from 'lucide-react';
import AtivoForm from '@/components/forms/AtivoForm';
import { PageHeader, Skeleton, ErroApi } from '@/components/ui';
import { useApi } from '@/lib/hooks';
import { api } from '@/lib/api';

export default function EditarAtivo() {
  const { id } = useParams();
  const { data: a, erro } = useApi(() => api.ativos.obter(id), [id], { auto: false });
  return (
    <div className="page">
      <Link href={`/ativos/${id}`} className="back-link"><ArrowLeft size={15} /> Voltar ao equipamento</Link>
      <PageHeader icone={Pencil} titulo={a ? `Editar ${a.patrimonio}` : 'Editar equipamento'} subtitulo={a?.nome} />
      <ErroApi erro={erro} />
      {a ? <AtivoForm inicial={a} /> : !erro && <Skeleton h={420} />}
    </div>
  );
}

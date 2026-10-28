'use client';

import Link from 'next/link';
import { Plus, Pencil, Trash2, ArrowRightLeft, MessageSquare, CheckCircle2, CalendarPlus, RotateCcw, FilePlus2, ThumbsUp, XCircle, Bookmark, Unlink, Truck, LogIn, LogOut, ShieldX, KeyRound, ClipboardCheck, DatabaseBackup, Ban, PackagePlus, PackageMinus, Scale, PackageCheck, UserCheck, UserX, Eye } from 'lucide-react';
import { relativo, dataHora } from '@/lib/format';

const ACOES = {
  criou: { icone: Plus, tom: 'green', verbo: 'cadastrou' },
  atualizou: { icone: Pencil, tom: 'blue', verbo: 'atualizou' },
  excluiu: { icone: Trash2, tom: 'red', verbo: 'excluiu' },
  moveu: { icone: ArrowRightLeft, tom: 'violet', verbo: 'moveu' },
  comentou: { icone: MessageSquare, tom: 'cyan', verbo: 'comentou em' },
  resolveu: { icone: CheckCircle2, tom: 'green', verbo: 'resolveu' },
  concluiu: { icone: CheckCircle2, tom: 'green', verbo: 'concluiu' },
  agendou: { icone: CalendarPlus, tom: 'amber', verbo: 'agendou' },
  reabriu: { icone: RotateCcw, tom: 'orange', verbo: 'reabriu' },
  solicitou: { icone: FilePlus2, tom: 'cyan', verbo: 'abriu' },
  aprovou: { icone: ThumbsUp, tom: 'green', verbo: 'aprovou' },
  rejeitou: { icone: XCircle, tom: 'red', verbo: 'rejeitou' },
  cancelou: { icone: Ban, tom: 'slate', verbo: 'cancelou' },
  reservou: { icone: Bookmark, tom: 'cyan', verbo: 'reservou itens para' },
  liberou: { icone: Unlink, tom: 'amber', verbo: 'liberou a reserva de' },
  enviou: { icone: Truck, tom: 'pink', verbo: 'despachou' },
  entregou: { icone: PackageCheck, tom: 'green', verbo: 'concluiu a entrega de' },
  entrada: { icone: PackagePlus, tom: 'green', verbo: 'registrou entrada de' },
  saida: { icone: PackageMinus, tom: 'red', verbo: 'registrou saída de' },
  ajuste: { icone: Scale, tom: 'amber', verbo: 'ajustou o saldo de' },
  ativou: { icone: UserCheck, tom: 'green', verbo: 'reativou' },
  desativou: { icone: UserX, tom: 'red', verbo: 'desativou' },
  visualizou: { icone: Eye, tom: 'blue', verbo: 'abriu' },
  entrou: { icone: LogIn, tom: 'blue', verbo: 'entrou no sistema' },
  saiu: { icone: LogOut, tom: 'slate', verbo: 'saiu do sistema' },
  falhou: { icone: KeyRound, tom: 'orange', verbo: 'tentou entrar sem sucesso' },
  negado: { icone: ShieldX, tom: 'red', verbo: 'teve acesso negado em' },
  conferiu: { icone: ClipboardCheck, tom: 'violet', verbo: 'fez a' },
  restaurou: { icone: DatabaseBackup, tom: 'amber', verbo: 'restaurou' }
};
const ENT = { ativo: 'o equipamento', evento: 'a tarefa', solicitacao: 'a solicitação', usuario: 'o usuário', estoque: '', sistema: '', acesso: '' };

export function AtividadeItem({ h, compacto }) {
  const a = ACOES[h.acao] || ACOES.atualizou;
  const I = a.icone;
  const alvo = h.acao === 'excluiu' ? <strong>{h.titulo}</strong>
    : h.entidade === 'ativo' ? <Link href={`/ativos/${h.entidadeId}`}>{h.titulo}</Link>
        : h.entidade === 'solicitacao' ? <Link href={`/solicitacoes/${h.entidadeId}`}>{h.titulo}</Link>
          : ['entrou', 'saiu', 'falhou'].includes(h.acao) ? null
        : <strong>{h.titulo}</strong>;
  return (
    <li className="tl-item">
      <span className={`tl-icon tone-${a.tom}`}><I size={14} aria-hidden="true" /></span>
      <div className="tl-body">
        <p><strong>{h.usuario}</strong> {a.verbo} {!compacto && ENT[h.entidade]} {alvo}</p>
        {h.detalhe && <p className="tl-detail">{h.detalhe}</p>}
        <time dateTime={h.em} title={dataHora(h.em)}>{relativo(h.em)}</time>
      </div>
    </li>
  );
}

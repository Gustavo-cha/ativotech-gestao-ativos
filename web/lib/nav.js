import {
  LayoutDashboard, Boxes, KanbanSquare, CalendarDays, BellRing, BarChart3, History, Settings,
  Home, FilePlus2, ClipboardList, PackageSearch, Inbox, Warehouse, Users, Truck, Mail, UsersRound
} from 'lucide-react';
import { temPermissao } from '@/components/auth';

// Estrutura do menu lateral. Cada item declara a permissão necessária;
// o menu mostra só o que o perfil pode usar (a API valida de novo em cada chamada).
export const NAV = [
  // Solicitante (RH)
  { secao: 'Portal de equipamentos', portal: true, itens: [
    { href: '/portal', label: 'Início', icone: Home, desc: 'Resumo do estoque e das suas solicitações', perm: 'solicitacoes:acompanhar', exato: true },
    { href: '/portal/nova', label: 'Nova solicitação', icone: FilePlus2, desc: 'Pedir notebook e equipamentos para uma admissão', perm: 'solicitacoes:criar' },
    { href: '/portal/solicitacoes', label: 'Minhas solicitações', icone: ClipboardList, desc: 'Acompanhe status, envio e rastreio', perm: 'solicitacoes:acompanhar', badge: 'naoLidas' },
    { href: '/portal/estoque', label: 'Estoque disponível', icone: PackageSearch, desc: 'O que há disponível agora', perm: 'estoque:ver' }
  ] },
  // Operador (TI)
  { secao: 'Logística', itens: [
    { href: '/', label: 'Painel', icone: LayoutDashboard, desc: 'Visão geral e indicadores', perm: 'painel:ver', exato: true },
    { href: '/solicitacoes', label: 'Solicitações', icone: Inbox, desc: 'Pedidos do RH: análise, reserva e preparação', perm: 'solicitacoes:gerenciar', badge: 'novas', destaque: true },
    { href: '/envios', label: 'Envios', icone: Truck, desc: 'Preparação, transporte, rastreio e entrega', perm: 'solicitacoes:gerenciar', badge: 'envios', destaque: true },
    { href: '/estoque', label: 'Estoque', icone: Warehouse, desc: 'Equipamentos, acessórios, entradas e saídas', perm: 'estoque:gerenciar', badge: 'estoque', destaque: true }
  ] },
  { secao: 'Equipamentos', itens: [
    { href: '/ativos', label: 'Inventário', icone: Boxes, desc: 'Equipamentos com patrimônio, proprietário e colaborador', perm: 'ativos:ver' },
    { href: '/colaboradores', label: 'Colaboradores', icone: UsersRound, desc: 'Quem recebe os equipamentos (e-mail corporativo)', perm: 'colaboradores:ver' },
    { href: '/quadro', label: 'Quadro', icone: KanbanSquare, desc: 'Arraste equipamentos entre status', perm: 'ativos:ver' },
    { href: '/agenda', label: 'Agenda', icone: CalendarDays, desc: 'Admissões, entregas e tarefas da equipe', perm: 'eventos:gerenciar', badge: 'agenda' },
    { href: '/alertas', label: 'Alertas', icone: BellRing, desc: 'Admissões, envios, estoque e garantias', perm: 'alertas:ver', badge: 'alertas' }
  ] },
  { secao: 'Gestão', itens: [
    { href: '/usuarios', label: 'Usuários', icone: Users, desc: 'Gerenciamento de usuários e licenças', perm: 'usuarios:gerenciar', destaque: true },
    { href: '/notificacoes', label: 'Notificações', icone: Mail, desc: 'E-mails automáticos: configuração e fila', perm: 'notificacoes:gerenciar', badge: 'emails' },
    { href: '/relatorios', label: 'Relatórios', icone: BarChart3, desc: 'Gráficos e exportações', perm: 'painel:ver' },
    { href: '/atividade', label: 'Atividade', icone: History, desc: 'Trilha de auditoria', perm: 'historico:ver' }
  ] }
];
export const NAV_CONFIG = { href: '/configuracoes', label: 'Configurações', icone: Settings, desc: 'Conta, senha, aparência e alertas', perm: null };

const ehOperador = (u) => temPermissao(u, 'solicitacoes:gerenciar');

// O Operador acompanha as solicitações pelo painel da TI; o Solicitante só vê o portal
export function navDoUsuario(usuario) {
  const op = ehOperador(usuario);
  return NAV.filter((s) => (op ? !s.portal : s.portal))
    .map((s) => ({ ...s, itens: s.itens.filter((i) => temPermissao(usuario, i.perm)) }))
    .filter((s) => s.itens.length);
}
export const paginasDoUsuario = (usuario) => [...navDoUsuario(usuario).flatMap((s) => s.itens), NAV_CONFIG];

export const inicioDoUsuario = (usuario) => (ehOperador(usuario) ? '/' : '/portal');

// Proteção de rotas no navegador (espelha as permissões da API)
const REGRAS = [
  ['/usuarios', 'usuarios:gerenciar'],
  ['/notificacoes', 'notificacoes:gerenciar'],
  ['/portal/estoque', 'estoque:ver'],
  ['/portal/nova', 'solicitacoes:criar'],
  ['/portal', 'solicitacoes:acompanhar'],
  ['/solicitacoes', 'solicitacoes:gerenciar'],
  ['/envios', 'solicitacoes:gerenciar'],
  ['/estoque', 'estoque:gerenciar'],
  ['/ativos/importar', 'importacao:executar'],
  ['/ativos/novo', 'ativos:gerenciar'],
  ['/ativos', 'ativos:ver'],
  ['/colaboradores', 'colaboradores:ver'],
  ['/quadro', 'ativos:ver'],
  ['/agenda', 'eventos:gerenciar'],
  ['/alertas', 'alertas:ver'],
  ['/relatorios', 'painel:ver'],
  ['/atividade', 'historico:ver'],
  ['/configuracoes', null]
];
export function rotaPermitida(path, usuario) {
  if (path === '/') return temPermissao(usuario, 'painel:ver');
  const regra = REGRAS.find(([p]) => path === p || path.startsWith(`${p}/`));
  return !regra || regra[1] === null || temPermissao(usuario, regra[1]);
}

export const tituloDaRota = (path) => {
  if (path === '/') return 'Painel';
  if (path === '/portal') return 'Portal de equipamentos';
  if (/^\/(portal\/)?solicitacoes\/[^/]+/.test(path)) return 'Detalhe da solicitação';
  if (path.startsWith('/ativos/novo')) return 'Novo equipamento';
  if (path.startsWith('/ativos/importar')) return 'Importar equipamentos';
  if (/^\/ativos\/[^/]+\/editar/.test(path)) return 'Editar equipamento';
  if (/^\/ativos\/[^/]+/.test(path)) return 'Equipamento';
  const todas = [...NAV.flatMap((s) => s.itens), NAV_CONFIG].sort((a, b) => b.href.length - a.href.length);
  return todas.find((p) => p.href !== '/' && path.startsWith(p.href))?.label || 'Ativos Tech';
};

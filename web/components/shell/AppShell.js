'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Boxes, CalendarPlus, Keyboard, FilePlus2, PackagePlus, BellRing, Truck, MessageSquare, FileUp } from 'lucide-react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import CommandPalette from './CommandPalette';
import Toasts from './Toasts';
import EventoModal from '../forms/EventoModal';
import { Modal } from '../ui';
import { useUI, useConfig, useToast } from '../providers';
import { useAuth } from '../auth';
import { useApi, useHotkey, useMontado } from '@/lib/hooks';
import { useAlertasDispensados, useVistos, naoLida } from '@/lib/portal';
import { api } from '@/lib/api';
import { conectarTempoReal } from '@/lib/tempoReal';
import { paginasDoUsuario, rotaPermitida, inicioDoUsuario } from '@/lib/nav';
import { apitar, audioBloqueado, desbloquearAudio } from '@/lib/sound';
import { data as fmtData } from '@/lib/format';

const digitando = (e) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable;

export { useAlertasDispensados } from '@/lib/portal';

function TelaCarregando() {
  return (
    <div className="boot" role="status" aria-label="Carregando">
      <span className="brand-mark boot-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22"><path d="M4 7l8-4 8 4-8 4-8-4z" fill="currentColor" /><path d="M4 12l8 4 8-4M4 17l8 4 8-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" opacity=".7" /></svg>
      </span>
    </div>
  );
}

// Decide o que mostrar: telas de acesso, carregamento, redirecionamento ou o app
const PUBLICAS = ['/acesso', '/login'];
const ehPublica = (p) => PUBLICAS.some((x) => p === x || p.startsWith(`${x}/`));
// Senha temporária só precisa ser trocada em sessões abertas com senha (login Microsoft não usa)
const precisaTrocarSenha = (u) => Boolean(u?.trocarSenha && u?.sessao?.metodo !== 'microsoft');

export default function AppShell({ children }) {
  const path = usePathname();
  const router = useRouter();
  const montado = useMontado();
  const { usuario, carregando } = useAuth();
  const publica = ehPublica(path);
  const trocaSenha = path === '/trocar-senha';
  const permitido = usuario && rotaPermitida(path, usuario);

  useEffect(() => {
    if (!montado || carregando) return;
    if (publica) {
      // Já logado: as telas de acesso levam direto ao início (exceto o retorno da Microsoft, que conclui sozinho)
      if (usuario && path !== '/login/microsoft') router.replace(precisaTrocarSenha(usuario) ? '/trocar-senha' : inicioDoUsuario(usuario));
      return;
    }
    if (!usuario) { router.replace(`/acesso${path && path !== '/' && !trocaSenha ? `?voltar=${encodeURIComponent(path)}` : ''}`); return; }
    if (precisaTrocarSenha(usuario) && !trocaSenha) { router.replace('/trocar-senha'); return; }
    if (!precisaTrocarSenha(usuario) && trocaSenha) { router.replace(inicioDoUsuario(usuario)); return; }
    if (!trocaSenha && !permitido) router.replace(inicioDoUsuario(usuario));
  }, [montado, carregando, publica, trocaSenha, usuario, permitido, path, router]);

  if (publica) return <>{montado ? children : <TelaCarregando />}<Toasts /></>;
  if (!montado || carregando || !usuario) return <TelaCarregando />;
  if (trocaSenha) return precisaTrocarSenha(usuario) ? <>{children}<Toasts /></> : <TelaCarregando />;
  if (precisaTrocarSenha(usuario) || !permitido) return <TelaCarregando />;
  return <ShellLogado>{children}</ShellLogado>;
}

const TITULO_BASE = 'Ativos Tech — Gestão de ativos e logística de TI';

function ShellLogado({ children }) {
  const path = usePathname();
  const router = useRouter();
  const ui = useUI();
  const { config, atualizar } = useConfig();
  const { toast } = useToast();
  const { usuario, pode } = useAuth();
  const [mobile, setMobile] = useState(false);
  const [dispensados, setDispensados] = useAlertasDispensados();
  const [vistos] = useVistos();
  const [conexao, setConexao] = useState('conectando');
  const [somBloqueado, setSomBloqueado] = useState(false);
  const operador = pode('solicitacoes:gerenciar');

  // Contadores do menu, do sino e do título: uma única resposta pequena (antes: painel completo + todos os alertas)
  const { data: cont } = useApi(() => (operador ? api.contadores() : Promise.resolve(null)), [operador, usuario?.id]);
  const { data: minhas } = useApi(() => (operador ? Promise.resolve([]) : api.solicitacoes.listar({ minhas: 1 })), [usuario?.id]);
  const novas = cont?.novas || 0;

  // Referências estáveis para usar dentro do canal em tempo real
  const ref = useRef({});
  ref.current = { config, toast, router, operador, usuario };

  // ---------- Nova solicitação (Operador): aviso persistente até ser aberto + alerta sonoro opcional ----------
  const notificarNova = useCallback((d) => {
    const { config: c, toast: t, router: r } = ref.current;
    const abrir = () => r.push(`/solicitacoes/${d.id}`);
    t({
      tipo: 'info', classe: 'toast-nova', icone: BellRing, duracao: 15000,
      titulo: `Nova solicitação ${d.numero}`,
      msg: `${d.nomeAdmitido} · ${d.itensResumo} · admissão ${fmtData(d.dataAdmissao)}`,
      acao: { label: 'Abrir', onClick: abrir }
    });
    if (c.alertaNovaSolicitacao) {
      apitar();
      if (audioBloqueado()) setSomBloqueado(true);
    }
    // Notificação do sistema operacional quando a aba está em segundo plano
    if (c.notificacaoNavegador && typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
      try {
        const n = new Notification(`Nova solicitação ${d.numero}`, { body: `${d.nomeAdmitido} · ${d.itensResumo}`, tag: d.id });
        n.onclick = () => { window.focus(); abrir(); n.close(); };
      } catch { /* navegador sem suporte */ }
    }
  }, []);

  // ---------- Canal em tempo real ----------
  useEffect(() => {
    const parar = conectarTempoReal({
      aoEstado: setConexao,
      aoEvento: (tipo, d) => {
        const { operador: op, toast: t, router: r, usuario: eu } = ref.current;
        if (tipo === 'solicitacao:nova' && op) notificarNova(d);
        // Solicitante: só as mudanças que importam (enviado, entregue, cancelado) geram aviso — as demais aparecem no sino
        if (tipo === 'solicitacao:status' && !op && ['Enviado', 'Entregue', 'Cancelado'].includes(d.status)) {
          t({ tipo: d.status === 'Cancelado' ? 'aviso' : 'sucesso', icone: d.status === 'Enviado' ? Truck : undefined,
            titulo: `${d.numero} · ${d.status}`, msg: d.nomeAdmitido,
            acao: { label: 'Ver', onClick: () => r.push(`/portal/solicitacoes/${d.id}`) } });
        }
        if (tipo === 'solicitacao:mensagem' && d.autorPerfil !== eu.perfil) {
          t({ tipo: 'info', icone: MessageSquare, titulo: `Nova mensagem em ${d.numero}`,
            acao: { label: 'Abrir', onClick: () => r.push(op ? `/solicitacoes/${d.id}` : `/portal/solicitacoes/${d.id}`) } });
        }
      }
    });
    return parar;
  }, [notificarNova]);

  // Libera o áudio no primeiro gesto do usuário (exigência dos navegadores) — só quando o alerta sonoro está ligado
  useEffect(() => {
    if (!operador || !config.alertaNovaSolicitacao) return undefined;
    const liberar = () => desbloquearAudio().then((ok) => ok && setSomBloqueado(false));
    window.addEventListener('pointerdown', liberar, { once: true });
    window.addEventListener('keydown', liberar, { once: true });
    return () => { window.removeEventListener('pointerdown', liberar); window.removeEventListener('keydown', liberar); };
  }, [operador, config.alertaNovaSolicitacao]);

  // Repetição do alerta (desligada por padrão): a cada 5 min enquanto houver solicitação nova sem abrir
  useEffect(() => {
    if (!operador || !novas || !config.alertaNovaSolicitacao || !config.repetirAlerta) return undefined;
    const t = setInterval(() => apitar(), 300000);
    return () => clearInterval(t);
  }, [operador, novas, config.alertaNovaSolicitacao, config.repetirAlerta]);

  // ---------- Solicitante: novidades nas próprias solicitações ----------
  const naoLidas = useMemo(() => (minhas || []).filter((s) => naoLida(s, usuario, vistos)), [minhas, vistos, usuario]);

  // Contador no título da aba: "(3) Ativos Tech…"
  const pendentesTitulo = operador ? novas : naoLidas.length;
  useEffect(() => {
    document.title = pendentesTitulo ? `(${pendentesTitulo}) ${TITULO_BASE}` : TITULO_BASE;
  }, [pendentesTitulo]);

  const alertasAtivos = useMemo(() => (cont?.alertas || []).filter((a) => !dispensados.includes(a.id)), [cont, dispensados]);
  const contadores = {
    alertas: alertasAtivos.length,
    agenda: cont?.agenda || 0,
    novas,
    envios: (cont?.emPreparacao || 0) + (cont?.emTransito || 0),
    estoque: cont?.estoque || 0,
    naoLidas: naoLidas.length,
    emails: cont?.emails ? (cont.emails.contagem?.falhou || 0) + (cont.emails.configurado ? 0 : 1) : 0
  };

  const dispensar = useCallback((ids) => setDispensados((d) => [...new Set([...d, ...ids])]), [setDispensados]);

  // ---------- Atalhos de teclado (só os que o perfil pode usar) ----------
  const paginas = useMemo(() => paginasDoUsuario(usuario), [usuario]);
  useHotkey((e) => (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k', () => (ui.janela?.tipo === 'paleta' ? ui.fechar() : ui.abrir('paleta')), [ui]);
  useHotkey((e) => !digitando(e) && !e.ctrlKey && !e.metaKey && !e.altKey && !ui.janela && ['n', 'e', '?', '/'].includes(e.key.toLowerCase()), (e) => {
    const t = e.key.toLowerCase();
    if (t === 'n') router.push(pode('ativos:gerenciar') ? '/ativos/novo' : '/portal/nova');
    if (t === 'e' && pode('eventos:gerenciar')) ui.abrir('evento');
    if (t === '?') ui.abrir('atalhos');
    if (t === '/') ui.abrir('paleta');
  }, [ui, router, pode]);
  // Ctrl/⌘ + B: menu completo ⇄ só ícones
  useHotkey((e) => (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b' && !digitando(e),
    () => atualizar({ sidebarRecolhida: !config.sidebarRecolhida }), [atualizar, config.sidebarRecolhida]);
  useHotkey((e) => e.altKey && /^Digit[1-9]$/.test(e.code), (e) => {
    const p = paginas[Number(e.code.slice(5)) - 1];
    if (p) router.push(p.href);
  }, [router, paginas]);

  useEffect(() => { setMobile(false); }, [path]);
  const fecharMobile = useCallback(() => setMobile(false), []);

  return (
    <div className={`app ${config.sidebarRecolhida ? 'side-collapsed' : ''}`}>
      <a href="#conteudo" className="skip-link">Pular para o conteúdo</a>
      <Sidebar contadores={contadores} mobileAberto={mobile} fecharMobile={fecharMobile} />
      <div className="app-main">
        <Topbar abrirMobile={() => setMobile(true)} alertasIds={alertasAtivos} dispensar={dispensar} naoLidas={naoLidas}
          conexao={conexao} novas={cont?.novasLista || []} qtdNovas={novas}
          somBloqueado={somBloqueado && operador && config.alertaNovaSolicitacao}
          ativarSom={() => desbloquearAudio().then((ok) => { setSomBloqueado(!ok); if (ok) apitar(); })} />
        <main id="conteudo" className="content">{children}</main>
      </div>

      <CommandPalette />
      {pode('eventos:gerenciar') && <EventoModal />}
      <NovoRapido />
      <Atalhos />
      <Toasts />
    </div>
  );
}

// Janela "Criar novo" — opções conforme o perfil
function NovoRapido() {
  const ui = useUI();
  const router = useRouter();
  const { pode } = useAuth();
  const aberto = ui.janela?.tipo === 'novo-rapido';
  const op = [
    pode('estoque:gerenciar') && { icone: PackagePlus, titulo: 'Entrada de estoque', desc: 'Registrar chegada de acessórios e periféricos', tom: 'green', run: () => router.push('/estoque?aba=itens&acao=entrada') },
    pode('ativos:gerenciar') && { icone: Boxes, titulo: 'Equipamento', desc: 'Cadastrar notebook, monitor ou celular com patrimônio', tom: 'blue', run: () => router.push('/ativos/novo'), k: 'N' },
    pode('importacao:executar') && { icone: FileUp, titulo: 'Importar planilha', desc: 'Trazer equipamentos do Desk Manager, SharePoint ou Excel', tom: 'violet', run: () => router.push('/ativos/importar') },
    pode('solicitacoes:criar') && { icone: FilePlus2, titulo: 'Solicitação', desc: 'Pedir equipamentos para uma admissão', tom: 'cyan', run: () => router.push('/portal/nova'), k: pode('ativos:gerenciar') ? null : 'N' },
    pode('eventos:gerenciar') && { icone: CalendarPlus, titulo: 'Tarefa na agenda', desc: 'Agendar entrega, coleta ou manutenção', tom: 'violet', run: () => ui.abrir('evento'), k: 'E' }
  ].filter(Boolean);
  return (
    <Modal aberto={aberto} onClose={ui.fechar} titulo="Criar novo" subtitulo="O que você quer registrar?" largura={op.length > 3 ? 720 : 620}>
      <div className="quick-grid" style={{ gridTemplateColumns: `repeat(${Math.min(op.length, 3)}, 1fr)` }}>
        {op.map((o) => {
          const I = o.icone;
          return (
            <button key={o.titulo} type="button" className={`quick-card tone-${o.tom}`} onClick={() => { ui.fechar(); o.run(); }}>
              <span className="quick-icon"><I size={22} /></span>
              <strong>{o.titulo}</strong>
              <small>{o.desc}</small>
              {o.k && <kbd>{o.k}</kbd>}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

function Atalhos() {
  const ui = useUI();
  const { pode } = useAuth();
  const mac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);
  const lista = [
    [`${mac ? '⌘' : 'Ctrl'} + K`, 'Abrir a paleta de comandos / busca'],
    ['/', 'Buscar'],
    ['N', pode('ativos:gerenciar') ? 'Cadastrar equipamento' : 'Nova solicitação'],
    pode('eventos:gerenciar') && ['E', 'Nova tarefa na agenda'],
    ['Alt + 1…9', 'Ir para as páginas do menu, na ordem'],
    [`${mac ? '⌘' : 'Ctrl'} + B`, 'Recolher ou expandir o menu lateral'],
    ['Esc', 'Fechar janelas'],
    ['?', 'Mostrar esta lista']
  ].filter(Boolean);
  return (
    <Modal aberto={ui.janela?.tipo === 'atalhos'} onClose={ui.fechar} titulo="Atalhos de teclado" icone={Keyboard} largura={520}>
      <ul className="shortcut-list">
        {lista.map(([t, d]) => <li key={t}><kbd>{t}</kbd><span>{d}</span></li>)}
      </ul>
    </Modal>
  );
}

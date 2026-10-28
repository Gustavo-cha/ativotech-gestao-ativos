'use client';

import { useEffect, useState } from 'react';
import { Settings, Palette, Database, Keyboard, User, Sun, Moon, Monitor, Play, DatabaseBackup, RotateCcw, Server, CheckCircle2, XCircle, Info, ShieldCheck, KeyRound, BellRing } from 'lucide-react';
import { PageHeader, Switch, Segmented, Field, Avatar, Badge } from '@/components/ui';
import { useAuth } from '@/components/auth';
import { useConfig, useUI, useToast, CONFIG_PADRAO } from '@/components/providers';
import { api, API_URL } from '@/lib/api';
import SenhaForm from '@/components/auth/SenhaForm';
import { ACENTOS, TOM_PERFIL } from '@/lib/constants';
import { apitar, desbloquearAudio } from '@/lib/sound';

function Linha({ titulo, desc, children }) {
  return (
    <div className="setting-row"><div><strong>{titulo}</strong>{desc && <small className="muted">{desc}</small>}</div><div className="setting-ctrl">{children}</div></div>
  );
}

// Alerta de nova solicitação (Operador): apito, repetição e notificação do sistema operacional
function AlertaSolicitacoes({ config, atualizar, toast }) {
  const suporte = typeof Notification !== 'undefined';
  const [permissao, setPermissao] = useState(suporte ? Notification.permission : 'unsupported');
  async function alternarNotificacao(v) {
    if (!v) { atualizar({ notificacaoNavegador: false }); return; }
    if (!suporte) { toast({ tipo: 'aviso', titulo: 'Este navegador não suporta notificações' }); return; }
    const p = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    setPermissao(p);
    if (p === 'granted') {
      atualizar({ notificacaoNavegador: true });
      try { new Notification('Ativos Tech', { body: 'Notificações ativadas: você será avisado de novas solicitações mesmo com a aba em segundo plano.' }); } catch { /* sem suporte */ }
    } else toast({ tipo: 'aviso', titulo: 'Permissão negada pelo navegador', msg: 'Libere as notificações para este site nas configurações do navegador.' });
  }
  return (
    <section className="card settings-card">
      <h2 className="section-title"><BellRing size={18} /> Alerta de novas solicitações</h2>
      <p className="muted small">A interface é silenciosa: o único som do sistema é este alerta, quando o RH abre uma solicitação.</p>
      <Linha titulo="Alerta sonoro" desc="Dois toques curtos quando chega uma nova solicitação, em tempo real.">
        <Switch checked={config.alertaNovaSolicitacao} onChange={(v) => atualizar({ alertaNovaSolicitacao: v })} label="Alerta sonoro de nova solicitação" />
      </Linha>
      <Linha titulo="Volume" desc={`${Math.round(config.volumeAlerta * 100)}%`}>
        <input type="range" min="0.1" max="1" step="0.05" value={config.volumeAlerta} className="range" aria-label="Volume do apito"
          onChange={(e) => atualizar({ volumeAlerta: Number(e.target.value) })} disabled={!config.alertaNovaSolicitacao} />
        <button type="button" className="btn btn-sm" onClick={() => desbloquearAudio().then(() => apitar())}><Play size={13} /> Testar</button>
      </Linha>
      <Linha titulo="Repetir enquanto ninguém abrir" desc="Desligado por padrão. Toca de novo a cada 5 minutos enquanto houver solicitação nova sem ser aberta pela TI.">
        <Switch checked={config.repetirAlerta} onChange={(v) => atualizar({ repetirAlerta: v })} label="Repetir alerta" />
      </Linha>
      <Linha titulo="Notificação do sistema" desc={permissao === 'denied' ? 'Bloqueada no navegador — libere nas permissões do site.' : 'Mostra um aviso do Windows/macOS quando a aba estiver em segundo plano.'}>
        <Switch checked={config.notificacaoNavegador && permissao === 'granted'} onChange={alternarNotificacao} label="Notificação do sistema" />
      </Linha>
    </section>
  );
}

export default function Configuracoes() {
  const { config, atualizar } = useConfig();
  const ui = useUI();
  const { toast } = useToast();
  const { usuario, pode, atualizarUsuario } = useAuth();
  const [saude, setSaude] = useState(null);

  const testarApi = async () => {
    setSaude('...');
    try {
      const r = await fetch(`${API_URL}/health`).then((x) => x.json());
      setSaude(r.status === 'ok' ? `ok:${r.versao}` : 'erro');
    } catch { setSaude('erro'); }
  };
  useEffect(() => { testarApi(); }, []);

  async function restaurar() {
    if (!window.confirm('Restaurar os dados de exemplo? Tudo o que você cadastrou será substituído.')) return;
    await api.reset();
    toast({ tipo: 'sucesso', titulo: 'Dados de exemplo restaurados' });
  }

  return (
    <div className="page page-narrow">
      <PageHeader icone={Settings} titulo="Configurações" subtitulo="Conta, senha, aparência e alertas. As preferências de tela ficam salvas neste navegador." />

      <section className="card settings-card">
        <h2 className="section-title"><User size={18} /> Minha conta</h2>
        <div className="account-row">
          <Avatar nome={usuario.nome} size={46} />
          <div><strong>{usuario.nome}</strong><small className="muted">{usuario.email}{usuario.departamento ? ` · ${usuario.departamento}` : ''}</small></div>
          <Badge tom={TOM_PERFIL[usuario.perfil]}><ShieldCheck size={11} /> {usuario.perfilNome}</Badge>
        </div>
        <dl className="conta-dl">
          <div><dt>Portal desta sessão</dt><dd>{usuario.sessao?.portal === 'ti' ? 'Portal do Operador' : 'Portal do Solicitante'} · {usuario.sessao?.empresa || 'H&CO'}</dd></div>
          <div><dt>Entrou com</dt><dd>{usuario.sessao?.metodo === 'microsoft' ? 'Conta Microsoft' : 'E-mail e senha'}</dd></div>
          <div><dt>Licença</dt><dd>{usuario.licenca?.efetiva === 'ativa' ? `Ativa${usuario.licenca.validaAte ? ` até ${usuario.licenca.validaAte.split('-').reverse().join('/')}` : ''}` : usuario.licenca?.efetiva}</dd></div>
          {usuario.admin && <div><dt>Permissão</dt><dd>Administrador</dd></div>}
        </dl>
        <Linha titulo="Notificações por e-mail" desc={usuario.perfil === 'ti' ? 'Receber e-mail quando o RH abrir uma solicitação ou enviar uma mensagem.' : 'Receber e-mail quando a TI atualizar as suas solicitações.'}>
          <Switch checked={usuario.notificacoesEmail !== false} label="Notificações por e-mail" onChange={async (v) => {
            try { const u = await api.auth.preferencias({ notificacoesEmail: v }); atualizarUsuario((x) => ({ ...x, ...u })); toast({ tipo: 'sucesso', titulo: v ? 'Você vai receber e-mails de notificação' : 'E-mails de notificação desativados' }); }
            catch (e) { toast({ tipo: 'erro', titulo: 'Não foi possível salvar', msg: e.message }); }
          }} />
        </Linha>
      </section>

      <section className="card settings-card">
        <h2 className="section-title"><KeyRound size={18} /> Alterar senha</h2>
        {usuario.temSenha
          ? <><p className="muted small">Informe a senha atual e a nova senha. Ao salvar, as sessões abertas em outros dispositivos são encerradas.</p><SenhaForm compacto /></>
          : <p className="muted small">Sua conta entra somente com a conta Microsoft — não há senha local para alterar.</p>}
      </section>

      <section className="card settings-card">
        <h2 className="section-title"><Palette size={18} /> Aparência</h2>
        <Linha titulo="Tema" desc="Automático segue o modo do seu sistema operacional.">
          <Segmented label="Tema" valor={config.tema} onChange={(v) => atualizar({ tema: v })} opcoes={[
            { id: 'claro', label: 'Claro', icone: Sun }, { id: 'escuro', label: 'Escuro', icone: Moon }, { id: 'sistema', label: 'Automático', icone: Monitor }
          ]} />
        </Linha>
        <Linha titulo="Cor de destaque" desc="Botões, links e elementos ativos.">
          <div className="swatches" role="radiogroup" aria-label="Cor de destaque">
            {Object.entries(ACENTOS).map(([id, a]) => (
              <button key={id} type="button" role="radio" aria-checked={config.acento === id} aria-label={a.nome} title={a.nome}
                className={`swatch ${config.acento === id ? 'on' : ''}`} style={{ '--sw': a.cor }} onClick={() => { atualizar({ acento: id }); }} />
            ))}
          </div>
        </Linha>
        <Linha titulo="Densidade" desc="Compacta mostra mais informação por tela.">
          <Segmented label="Densidade" valor={config.densidade} onChange={(v) => atualizar({ densidade: v })} opcoes={[{ id: 'confortavel', label: 'Confortável' }, { id: 'compacta', label: 'Compacta' }]} />
        </Linha>
        <Linha titulo="Transições" desc="Transições curtas ao abrir janelas e menus. Desligue para uma interface totalmente estática.">
          <Switch checked={config.animacoes} onChange={(v) => atualizar({ animacoes: v })} label="Animações" />
        </Linha>
        <Linha titulo="Menu lateral recolhido" desc="Mostra só os ícones para ganhar espaço.">
          <Switch checked={config.sidebarRecolhida} onChange={(v) => atualizar({ sidebarRecolhida: v })} label="Menu recolhido" />
        </Linha>
      </section>

      {pode('solicitacoes:gerenciar') && <AlertaSolicitacoes config={config} atualizar={atualizar} toast={toast} />}

      <section className="card settings-card">
        <h2 className="section-title"><Database size={18} /> Dados {!pode('sistema:admin') && <Badge tom="slate">Somente administradores alteram</Badge>}</h2>
        <Linha titulo="Conexão com a API" desc={API_URL}>
          <span className={`api-status ${saude?.startsWith('ok') ? 'ok' : saude === 'erro' ? 'err' : ''}`}>
            {saude?.startsWith('ok') ? <><CheckCircle2 size={15} /> Online · v{saude.slice(3)}</> : saude === 'erro' ? <><XCircle size={15} /> Offline</> : <><Server size={15} /> Verificando…</>}
          </span>
          <button type="button" className="btn btn-sm" onClick={testarApi}>Testar</button>
        </Linha>
        {pode('sistema:admin') && <>
          <Linha titulo="Backup completo" desc="Equipamentos, estoque, movimentações, solicitações, eventos, usuários (sem senhas) e histórico em JSON.">
            <button type="button" className="btn btn-sm" onClick={() => api.backup().catch((e) => toast({ tipo: 'erro', titulo: 'Erro no backup', msg: e.message }))}><DatabaseBackup size={14} /> Baixar backup</button>
          </Linha>
          <Linha titulo="Restaurar dados de exemplo" desc="Útil para demonstrações. Substitui equipamentos, estoque e solicitações (os usuários são mantidos).">
            <button type="button" className="btn btn-sm btn-danger-ghost" onClick={restaurar}><RotateCcw size={14} /> Restaurar</button>
          </Linha>
        </>}
      </section>

      <section className="card settings-card">
        <h2 className="section-title"><Keyboard size={18} /> Atalhos e ajuda</h2>
        <Linha titulo="Atalhos de teclado" desc="Ctrl+K abre a busca e a paleta de comandos de qualquer tela.">
          <button type="button" className="btn btn-sm" onClick={() => ui.abrir('atalhos')}>Ver atalhos</button>
        </Linha>
        <Linha titulo="Restaurar preferências" desc="Volta tema, cores e sons ao padrão.">
          <button type="button" className="btn btn-sm" onClick={() => { atualizar({ ...CONFIG_PADRAO }); toast({ tipo: 'info', titulo: 'Preferências restauradas' }); }}>Restaurar padrão</button>
        </Linha>
        <p className="muted small about"><Info size={14} /> Ativos Tech 5.0 · Next.js + Node.js/Express · Solicitações, estoque, envios, usuários e licenças</p>
      </section>
    </div>
  );
}

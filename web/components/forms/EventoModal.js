'use client';

import { useEffect, useState } from 'react';
import { CalendarPlus, CalendarCog, Trash2 } from 'lucide-react';
import { Modal, Field } from '../ui';
import { useUI, useToast } from '../providers';
import { api } from '@/lib/api';
import { TOM_EVENTO } from '@/lib/constants';
import { isoLocal, data as fmtData } from '@/lib/format';

const TIPOS = ['Manutenção', 'Entrega', 'Devolução', 'Renovação', 'Auditoria', 'Reunião', 'Outro'];

export default function EventoModal() {
  const ui = useUI();
  const { toast } = useToast();
  const aberto = ui.janela?.tipo === 'evento';
  const existente = aberto ? ui.janela.dados.evento : null;
  const [dados, setDados] = useState({});
  const [erros, setErros] = useState({});
  const [ativos, setAtivos] = useState([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    const base = { titulo: '', tipo: 'Manutenção', data: isoLocal(), hora: '', ativoId: '', responsavel: '', descricao: '', concluido: false };
    const ev = ui.janela.dados.evento;
    setDados(ev ? { ...base, ...ev, ativoId: ev.ativoId || '' } : { ...base, ...ui.janela.dados });
    setErros({});
    api.ativos.opcoes().then((l) => setAtivos(l.filter((a) => a.status !== 'Descartado'))).catch(() => {});
  }, [aberto, ui.janela]);

  const set = (k) => (e) => setDados((d) => ({ ...d, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true);
    try {
      const payload = { titulo: dados.titulo, tipo: dados.tipo, data: dados.data, hora: dados.hora, ativoId: dados.ativoId, responsavel: dados.responsavel, descricao: dados.descricao, concluido: dados.concluido };
      const ev = existente ? await api.eventos.atualizar(existente.id, payload) : await api.eventos.criar(payload);
      ui.fechar();
      toast({ tipo: 'sucesso', titulo: existente ? 'Evento atualizado' : 'Evento agendado', msg: `${ev.titulo} · ${fmtData(ev.data)}${ev.hora ? ` às ${ev.hora}` : ''}` });
    } catch (err) {
      setErros(err.campos || {});
      toast({ tipo: 'erro', titulo: 'Não foi possível salvar', msg: err.message });
    } finally {
      setSalvando(false);
    }
  }

  async function excluir() {
    if (!window.confirm(`Excluir "${existente.titulo}" da agenda?`)) return;
    try {
      await api.eventos.excluir(existente.id);
      ui.fechar();
      toast({ tipo: 'info', titulo: 'Evento excluído' });
    } catch (err) {
      toast({ tipo: 'erro', titulo: 'Erro ao excluir', msg: err.message });
    }
  }

  return (
    <Modal aberto={aberto} onClose={ui.fechar} titulo={existente ? 'Editar evento' : 'Novo evento'} icone={existente ? CalendarCog : CalendarPlus}
      subtitulo="Manutenções, entregas, renovações e outras tarefas do planner"
      rodape={<>
        {existente && <button type="button" className="btn btn-danger-ghost foot-left" onClick={excluir}><Trash2 size={15} /> Excluir</button>}
        <button type="button" className="btn" onClick={ui.fechar}>Cancelar</button>
        <button type="submit" form="form-evento" className="btn btn-primary" disabled={salvando}>{salvando ? 'Salvando…' : existente ? 'Salvar' : 'Agendar'}</button>
      </>}>
      <form id="form-evento" className="form-grid" onSubmit={salvar} noValidate>
        <Field label="Título" obrigatorio erro={erros.titulo} wide id="ev-titulo">
          <input id="ev-titulo" value={dados.titulo || ''} onChange={set('titulo')} placeholder="Ex.: Troca de toner da impressora" aria-invalid={!!erros.titulo} />
        </Field>
        <Field label="Tipo" wide>
          <div className="chip-select" role="radiogroup" aria-label="Tipo de evento">
            {TIPOS.map((t) => (
              <button key={t} type="button" role="radio" aria-checked={dados.tipo === t}
                className={`chip tone-${TOM_EVENTO[t]} ${dados.tipo === t ? 'on' : ''}`} onClick={() => { set('tipo')(t); }}>{t}</button>
            ))}
          </div>
        </Field>
        <Field label="Data" obrigatorio erro={erros.data} id="ev-data">
          <input id="ev-data" type="date" value={dados.data || ''} onChange={set('data')} aria-invalid={!!erros.data} />
        </Field>
        <Field label="Horário" erro={erros.hora} id="ev-hora" dica="Opcional">
          <input id="ev-hora" type="time" value={dados.hora || ''} onChange={set('hora')} />
        </Field>
        <Field label="Responsável" id="ev-resp">
          <input id="ev-resp" value={dados.responsavel || ''} onChange={set('responsavel')} placeholder="Quem vai executar?" />
        </Field>
        <Field label="Ativo relacionado" erro={erros.ativoId} id="ev-ativo">
          <select id="ev-ativo" value={dados.ativoId || ''} onChange={set('ativoId')}>
            <option value="">Nenhum</option>
            {ativos.map((a) => <option key={a.id} value={a.id}>{a.patrimonio} · {a.nome}</option>)}
          </select>
        </Field>
        <Field label="Observações" wide id="ev-desc">
          <textarea id="ev-desc" rows={3} value={dados.descricao || ''} onChange={set('descricao')} />
        </Field>
        {existente && (
          <label className="check-line field-wide">
            <input type="checkbox" checked={!!dados.concluido} onChange={set('concluido')} /> Marcar como concluído
          </label>
        )}
      </form>
    </Modal>
  );
}

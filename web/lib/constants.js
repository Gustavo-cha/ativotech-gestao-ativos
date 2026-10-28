// Cores e rótulos usados na interface. Os "tons" mapeiam para classes CSS (tone-*).
export const TOM_STATUS = { 'Disponível': 'green', 'Em uso': 'blue', 'Em manutenção': 'amber', 'Descartado': 'slate' };
export const TOM_EVENTO = { 'Manutenção': 'amber', Entrega: 'green', 'Devolução': 'blue', 'Renovação': 'violet', Auditoria: 'cyan', 'Reunião': 'pink', Outro: 'slate', Garantia: 'red', 'Admissão': 'pink', 'Previsão de entrega': 'green', Envio: 'orange' };
export const TOM_SEVERIDADE = { critico: 'red', alto: 'orange', medio: 'amber', info: 'blue' };
export const NOME_SEVERIDADE = { critico: 'Crítico', alto: 'Alto', medio: 'Médio', info: 'Informativo' };
export const GARANTIA = {
  vigente: { label: 'Vigente', tom: 'green' },
  vencendo: { label: 'Vencendo', tom: 'amber' },
  vencida: { label: 'Vencida', tom: 'red' },
  sem: { label: 'Sem garantia', tom: 'slate' }
};

// Cores das séries de gráficos (definidas como variáveis CSS para funcionar nos dois temas)
export const SERIES = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)', 'var(--c7)', 'var(--c8)'];
export const COR_TOM = (t) => `var(--${t}-fg)`;

export const ACENTOS = {
  azul: { nome: 'Azul', cor: '#2563eb' },
  violeta: { nome: 'Violeta', cor: '#7c3aed' },
  esmeralda: { nome: 'Esmeralda', cor: '#059669' },
  laranja: { nome: 'Laranja', cor: '#ea580c' },
  rosa: { nome: 'Rosa', cor: '#db2777' },
  ciano: { nome: 'Ciano', cor: '#0891b2' }
};

// ---------- Solicitações de equipamentos ----------
export const STATUS_SOLICITACAO = ['Pendente', 'Em análise', 'Aguardando estoque', 'Em preparação', 'Enviado', 'Entregue', 'Cancelado'];
export const TOM_SOLICITACAO = {
  'Pendente': 'blue', 'Em análise': 'violet', 'Aguardando estoque': 'amber',
  'Em preparação': 'orange', 'Enviado': 'cyan', 'Entregue': 'green', 'Cancelado': 'slate'
};
export const DESC_STATUS = {
  'Pendente': 'Recebida, aguardando a TI',
  'Em análise': 'A TI está avaliando o pedido',
  'Aguardando estoque': 'Falta equipamento no estoque',
  'Em preparação': 'Itens reservados e sendo configurados',
  'Enviado': 'A caminho do destino',
  'Entregue': 'Recebido pelo colaborador',
  'Cancelado': 'Encerrada sem entrega'
};
export const ETAPAS_SOLICITACAO = ['Pendente', 'Em análise', 'Em preparação', 'Enviado', 'Entregue'];
export const TIPOS_SOLICITACAO = ['Nova admissão', 'Substituição de equipamento', 'Outra necessidade'];
export const SITUACAO_ESTOQUE = {
  disponivel: { label: 'Disponível', tom: 'green', desc: 'Prontos para reservar' },
  reservado: { label: 'Reservado', tom: 'cyan', desc: 'Separados para admissões' },
  preparacao: { label: 'Em preparação', tom: 'orange', desc: 'Sendo configurados pela TI' },
  transito: { label: 'Enviado', tom: 'pink', desc: 'Em trânsito para o destino' },
  'em-uso': { label: 'Em uso', tom: 'violet', desc: 'Com colaboradores' },
  manutencao: { label: 'Manutenção', tom: 'amber', desc: 'Indisponíveis no momento' },
  baixado: { label: 'Baixado', tom: 'slate', desc: 'Descartados' }
};
export const TIPO_MOVIMENTACAO = {
  entrada: { label: 'Entrada', tom: 'green', sinal: '+' },
  saida: { label: 'Saída', tom: 'red', sinal: '−' },
  ajuste: { label: 'Ajuste', tom: 'amber', sinal: '=' },
  reserva: { label: 'Reserva', tom: 'cyan', sinal: '' },
  liberacao: { label: 'Liberação', tom: 'slate', sinal: '' },
  envio: { label: 'Envio', tom: 'pink', sinal: '−' },
  entrega: { label: 'Entrega', tom: 'violet', sinal: '' }
};
export const TOM_PERFIL = { ti: 'blue', rh: 'green' };
export const SIGLA_PERFIL = { ti: 'TI', rh: 'RH' };

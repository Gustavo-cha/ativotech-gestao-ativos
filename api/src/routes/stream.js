// Canal em tempo real (Server-Sent Events).
// O navegador abre GET /api/stream com o token no cabeçalho Authorization (lido via fetch),
// e o servidor empurra eventos assim que algo é gravado:
//   • rev                  → qualquer alteração (as telas recarregam os dados)
//   • solicitacao:nova     → só para Operadores (TI): dispara o alerta sonoro e o destaque
//   • solicitacao:status   → para Operadores e para o solicitante dono do pedido
//   • solicitacao:mensagem → para Operadores e para o dono
//   • solicitacao:vista    → para Operadores (tira o destaque de "nova" em todas as telas)
const express = require('express');
const db = require('../db');
const { pode, resolverSessao, MENSAGEM_BLOQUEIO } = require('../auth');

const router = express.Router();
const conexoes = new Set();

router.get('/', (req, res) => {
  const usuario = req.usuario;
  const operador = pode(usuario, 'solicitacoes:gerenciar');
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders?.();
  const enviar = (evento, dados) => res.write(`event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`);
  enviar('pronto', { rev: db.rev(), usuario: usuario.id, operador });

  const ouvir = ({ tipo, dados, rev }) => {
    if (tipo === 'rev') return enviar('rev', { rev });
    const dono = dados?.solicitanteId === usuario.id;
    if (tipo === 'solicitacao:nova' && operador && dados.abertoPorId !== usuario.id) return enviar(tipo, dados);
    if ((tipo === 'solicitacao:status' || tipo === 'solicitacao:mensagem') && (operador || dono)) return enviar(tipo, dados);
    if (tipo === 'solicitacao:vista' && operador) return enviar(tipo, dados);
    return undefined;
  };
  db.eventos.on('evento', ouvir);

  // Batimento a cada 20 s (mantém proxies abertos) e revalida a sessão: conta desativada ou sem licença é desconectada
  const batimento = setInterval(() => {
    const r = resolverSessao(req.token);
    if (!r.usuario) { enviar('sessao', { valida: false, erro: MENSAGEM_BLOQUEIO[r.motivo] || MENSAGEM_BLOQUEIO.sessao }); res.end(); return; }
    res.write(': ping\n\n');
  }, 20000);

  const conexao = { usuario: usuario.id, desde: Date.now() };
  conexoes.add(conexao);
  req.on('close', () => {
    clearInterval(batimento);
    db.eventos.off('evento', ouvir);
    conexoes.delete(conexao);
  });
});

// Quantos operadores estão conectados agora (exibido no painel de usuários)
router.get('/conectados', (req, res) => {
  if (!pode(req.usuario, 'usuarios:gerenciar')) return res.status(403).json({ erro: 'Você não tem permissão para esta ação.' });
  res.json({ conexoes: conexoes.size, usuarios: [...new Set([...conexoes].map((c) => c.usuario))] });
});

module.exports = router;

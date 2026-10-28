const express = require('express');
const os = require('os');
const cors = require('cors');
const config = require('./config');
const { enderecosRede, ehLocal } = require('./rede');
const db = require('./db');
const { autenticar, exigir, exigirSenhaDefinitiva } = require('./auth');
const { inicializarAdministrador } = require('./administrador');
const notificacoes = require('./notificacoes');
const authRouter = require('./routes/auth');
const usuariosRouter = require('./routes/usuarios');
const ativosRouter = require('./routes/ativos');
const { router: eventosRouter } = require('./routes/eventos');
const { router: solicitacoesRouter } = require('./routes/solicitacoes');
const estoqueRouter = require('./routes/estoque');
const painelRouter = require('./routes/painel');
const streamRouter = require('./routes/stream');
const licencasRouter = require('./routes/licencas');
const notificacoesRouter = require('./routes/notificacoes');
const colaboradoresRouter = require('./routes/colaboradores');
const importacaoRouter = require('./routes/importacao');

function createApp({ iniciarServicos = true } = {}) {
  if (iniciarServicos) {
    inicializarAdministrador();
    notificacoes.iniciar();
  }
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');

  // O navegador fala com a API pelo mesmo endereço do site (/api), então não precisa de CORS.
  // Só libera outras origens se forem configuradas explicitamente em CORS_ORIGIN.
  if (config.corsOrigens.length) app.use(cors({ origin: config.corsOrigens, exposedHeaders: ['X-Rev', 'Content-Disposition'] }));
  // (as planilhas de importação chegam como arquivo binário e são lidas só depois do login, na própria rota)
  app.use(express.json({ limit: '1mb' }));

  // Cabeçalhos de segurança + revisão atual dos dados em todas as respostas
  app.use((_req, res, next) => {
    db.sincronizarDisco(); // pega alterações feitas por outro processo (ex.: npm run criar-admin)
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    const writeHead = res.writeHead;
    res.writeHead = function (...args) {
      if (!res.headersSent) res.setHeader('X-Rev', String(db.rev()));
      return writeHead.apply(this, args);
    };
    next();
  });

  // ---------- Rotas públicas ----------
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', servico: 'AtivoTech API', versao: '6.1.0' }));
  app.use('/api/auth', authRouter);

  // ---------- Daqui para baixo: exige login ----------
  app.use('/api', autenticar);
  // Senha temporária: tudo fica bloqueado até o usuário definir uma senha própria
  app.use('/api', exigirSenhaDefinitiva);

  // Tempo real: canal de eventos (SSE). /sync é a alternativa por consulta periódica, se o canal cair.
  app.use('/api/stream', streamRouter);
  app.get('/api/sync', (_req, res) => res.json({ rev: db.rev(), em: db.revEm() }));

  // Permissões por módulo (aplicadas no servidor — a interface apenas reflete)
  const leituraOuGestao = (ver, gerenciar) => (req, res, next) => exigir(req.method === 'GET' ? ver : gerenciar)(req, res, next);
  app.use('/api/ativos', leituraOuGestao('ativos:ver', 'ativos:gerenciar'), ativosRouter);
  app.use('/api/eventos', exigir('eventos:gerenciar'), eventosRouter);
  app.use('/api/solicitacoes', solicitacoesRouter); // permissões por ação dentro do módulo
  app.use('/api/estoque', estoqueRouter);
  app.use('/api/usuarios', exigir('usuarios:gerenciar'), usuariosRouter);
  app.use('/api/licencas', exigir('licencas:gerenciar'), licencasRouter);
  app.use('/api/notificacoes', exigir('notificacoes:gerenciar'), notificacoesRouter);
  app.use('/api/colaboradores', exigir('colaboradores:ver'), colaboradoresRouter);
  app.use('/api/importacao', exigir('importacao:executar'), importacaoRouter);
  app.use('/api', painelRouter);

  // Endereço de acesso: ajuda o administrador a conferir se outras pessoas conseguem abrir o sistema
  app.get('/api/sistema/acesso', exigir('sistema:admin'), (_req, res) => {
    res.json({
      appUrl: config.appUrl,
      appUrlLocal: ehLocal(config.appUrl),
      servidor: os.hostname(),
      rede: enderecosRede(config.portaWeb).map(({ interface: _i, ...r }) => r),
      microsoftRedirectUri: config.microsoft.redirectUri
    });
  });

  app.use((_req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ erro: 'JSON inválido no corpo da requisição.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ erro: 'Requisição muito grande.' });
    console.error(err);
    res.status(500).json({ erro: 'Erro interno do servidor.' });
  });

  return app;
}

module.exports = { createApp };

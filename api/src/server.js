require('./config'); // carrega api/.env antes de tudo
const { createApp } = require('./app');

const PORT = Number(process.env.PORT) || 3001;

createApp().listen(PORT, () => {
  console.log(`AtivoTech API rodando em http://localhost:${PORT}/api`);
});

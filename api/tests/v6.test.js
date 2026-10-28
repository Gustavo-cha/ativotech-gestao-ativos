// Versão 6: proprietário do equipamento (H&CO × H&CO B2Finance), colaboradores por e-mail corporativo,
// importação de planilhas (CSV/XLSX) com prévia e confirmação, paginação e contadores leves.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { preparar } = require('./ajuda');

const ctx = preparar();
const { chamar } = ctx;
const dia = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const FIX = path.join(__dirname, 'fixtures');
const retirada = { modalidade: 'retirada', unidade: 'Matriz' };
const pedido = (extra = {}) => ({ nomeAdmitido: `Pessoa ${Math.random().toString(36).slice(2, 7)}`, departamento: 'Tributário', cargo: 'Analista', dataAdmissao: dia(10), tipo: 'Nova admissão',
  proprietario: 'H&CO', itens: [{ tipo: 'ativo', categoria: 'Notebook', quantidade: 1 }], entrega: retirada, ...extra });

async function enviarArquivo(quem, arquivo, nome = path.basename(arquivo)) {
  const r = await fetch(`${ctx.base}/importacao/analisar`, {
    method: 'POST', headers: { Authorization: `Bearer ${ctx.tokens[quem]}`, 'Content-Type': 'application/octet-stream', 'X-Arquivo-Nome': encodeURIComponent(nome) },
    body: Buffer.isBuffer(arquivo) ? arquivo : fs.readFileSync(arquivo)
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

before(async () => {
  await ctx.iniciar();
  await ctx.entrar('admin', ctx.admin.email, ctx.admin.senha, 'ti');
  await ctx.criarUsuario('rh', { nome: 'Rita RH', email: 'rita.rh@hco.com', perfil: 'rh' });
});
after(() => ctx.encerrar());

// ---------------- Proprietário ----------------
test('proprietário é obrigatório no cadastro e aparece no estoque separado por empresa', async () => {
  const sem = await chamar('admin', 'POST', '/ativos', { patrimonio: 'V6-001', nome: 'Notebook', categoria: 'Notebook', status: 'Disponível' });
  assert.strictEqual(sem.status, 422);
  assert.ok(sem.body.campos.proprietario);
  const ok = await chamar('admin', 'POST', '/ativos', { patrimonio: 'V6-001', nome: 'Notebook', categoria: 'Notebook', status: 'Disponível', proprietario: 'H&CO B2Finance' });
  assert.strictEqual(ok.status, 201);
  assert.strictEqual(ok.body.proprietario, 'H&CO B2Finance');

  const r = (await chamar('rh', 'GET', '/estoque/resumo')).body;
  const b2f = r.proprietarios.find((p) => p.proprietario === 'H&CO B2Finance');
  const hco = r.proprietarios.find((p) => p.proprietario === 'H&CO');
  assert.ok(b2f.notebooksDisponiveis >= 3 && hco.notebooksDisponiveis >= 2, JSON.stringify(r.proprietarios));
  assert.ok(!('reservados' in b2f) && !('saldoProjetado' in b2f), 'RH vê só os totais disponíveis');
  assert.ok(r.catalogo.every((c) => c.proprietario), 'cada item do catálogo informa o proprietário');
  assert.ok(!r.equipamentos, 'RH não recebe a lista de equipamentos');

  const so = (await chamar('admin', 'GET', '/estoque/resumo?proprietario=H%26CO%20B2Finance&detalhe=0')).body;
  assert.strictEqual(so.proprietario, 'H&CO B2Finance');
  assert.strictEqual(so.disponivel, b2f.notebooksDisponiveis);
  assert.ok(so.catalogo.every((c) => c.proprietario === 'H&CO B2Finance'));
});

test('solicitação por proprietário: nunca mistura os estoques', async () => {
  const catB2f = (await chamar('rh', 'GET', '/solicitacoes/catalogo?proprietario=H%26CO%20B2Finance')).body;
  assert.ok(catB2f.length && catB2f.every((c) => c.proprietario === 'H&CO B2Finance'));
  const mouseHco = (await chamar('rh', 'GET', '/solicitacoes/catalogo?proprietario=H%26CO')).body.find((c) => c.nome === 'Mouse sem fio');
  // Acessório da H&CO num pedido da B2Finance é recusado
  const misto = await chamar('rh', 'POST', '/solicitacoes', pedido({ proprietario: 'H&CO B2Finance', itens: [{ tipo: 'acessorio', itemId: mouseHco.itemId, quantidade: 1 }] }));
  assert.strictEqual(misto.status, 422);
  assert.match(misto.body.campos.itens, /H&CO/);
  // Sem proprietário também é recusado
  const sem = await chamar('rh', 'POST', '/solicitacoes', pedido({ proprietario: '' }));
  assert.ok(sem.body.campos.proprietario);

  const s = (await chamar('rh', 'POST', '/solicitacoes', pedido({ proprietario: 'H&CO B2Finance' }))).body;
  assert.strictEqual(s.proprietario, 'H&CO B2Finance');
  assert.strictEqual(s.itens[0].proprietario, 'H&CO B2Finance');
  // Disponíveis para a linha: só equipamentos da B2Finance
  const disp = (await chamar('admin', 'GET', `/solicitacoes/${s.id}/itens/${s.itens[0].id}/disponiveis`)).body;
  assert.ok(disp.length && disp.every((e) => e.proprietario === 'H&CO B2Finance'));
  // Tentar reservar um notebook da H&CO falha com mensagem clara
  const hcoNb = (await chamar('admin', 'GET', '/estoque/equipamentos?categoria=Notebook&proprietario=H%26CO')).body.find((e) => e.situacao === 'disponivel');
  const errado = await chamar('admin', 'PUT', `/solicitacoes/${s.id}/itens/${s.itens[0].id}`, { ativoIds: [hcoNb.id] });
  assert.strictEqual(errado.status, 422);
  assert.match(errado.body.erro, /pertence à H&CO/);
  // Reserva automática escolhe da empresa certa
  const auto = (await chamar('admin', 'POST', `/solicitacoes/${s.id}/reservar-tudo`)).body;
  assert.ok(auto.progressoReserva.completo);
  const id = auto.itens[0].equipamentos[0].id;
  assert.strictEqual((await chamar('admin', 'GET', `/ativos/${id}`)).body.proprietario, 'H&CO B2Finance');
  // Equipamento reservado não troca de proprietário
  const troca = await chamar('admin', 'POST', '/ativos/lote', { ids: [id], acao: 'proprietario', proprietario: 'H&CO' });
  assert.deepStrictEqual(troca.body.reservados.length, 1);
  await chamar('admin', 'POST', `/solicitacoes/${s.id}/rejeitar`, { motivo: 'Limpeza do teste' });
  assert.deepStrictEqual((await chamar('admin', 'GET', '/estoque/consistencia')).body.problemas, []);
});

test('ação em lote troca o proprietário e registra movimentação', async () => {
  const a = (await chamar('admin', 'POST', '/ativos', { patrimonio: 'V6-LOTE', nome: 'Monitor', categoria: 'Monitor', status: 'Disponível', proprietario: 'H&CO' })).body;
  const r = await chamar('admin', 'POST', '/ativos/lote', { ids: [a.id], acao: 'proprietario', proprietario: 'H&CO B2Finance' });
  assert.strictEqual(r.body.alterados, 1);
  assert.strictEqual((await chamar('admin', 'GET', `/ativos/${a.id}`)).body.proprietario, 'H&CO B2Finance');
  const movs = (await chamar('admin', 'GET', `/estoque/movimentacoes?ativoId=${a.id}`)).body;
  assert.ok(movs.some((m) => /Proprietário: H&CO → H&CO B2Finance/.test(m.motivo)));
});

// ---------------- Colaboradores ----------------
test('colaboradores: e-mail corporativo único, vínculo com equipamento e permissões', async () => {
  assert.strictEqual((await chamar('rh', 'GET', '/colaboradores')).status, 403, 'Solicitante não consulta o cadastro de colaboradores');
  const c = await chamar('admin', 'POST', '/colaboradores', { nome: 'Paula Lima', email: 'Paula.Lima@hco.com', empresa: 'H&CO', cargo: 'Auditora', departamento: 'Auditoria' });
  assert.strictEqual(c.status, 201);
  assert.strictEqual(c.body.email, 'paula.lima@hco.com');
  assert.strictEqual((await chamar('admin', 'POST', '/colaboradores', { nome: 'Outra Paula', email: 'paula.lima@hco.com', empresa: 'H&CO' })).status, 422);
  assert.ok((await chamar('admin', 'POST', '/colaboradores', { nome: 'Sem Email', email: 'invalido', empresa: 'H&CO' })).body.campos.email);

  // Cadastro do equipamento já criando um colaborador novo
  const a = await chamar('admin', 'POST', '/ativos', { patrimonio: 'V6-COL', nome: 'Notebook Paula', categoria: 'Notebook', status: 'Em uso', proprietario: 'H&CO',
    novoColaborador: { nome: 'Marcos Dias', email: 'marcos.dias@hco.com', empresa: 'H&CO' } });
  assert.strictEqual(a.status, 201, JSON.stringify(a.body));
  assert.strictEqual(a.body.colaborador.email, 'marcos.dias@hco.com');
  assert.strictEqual(a.body.responsavel, 'Marcos Dias');
  // Vincular um disponível a outro colaborador muda para "Em uso"
  const livre = (await chamar('admin', 'POST', '/ativos', { patrimonio: 'V6-LIVRE', nome: 'Monitor', categoria: 'Monitor', status: 'Disponível', proprietario: 'H&CO' })).body;
  await chamar('admin', 'POST', `/colaboradores/${c.body.id}/equipamentos`, { ativoId: livre.id });
  const depois = (await chamar('admin', 'GET', `/ativos/${livre.id}`)).body;
  assert.strictEqual(depois.status, 'Em uso');
  assert.strictEqual(depois.colaborador.nome, 'Paula Lima');
  const det = (await chamar('admin', 'GET', `/colaboradores/${c.body.id}`)).body;
  assert.strictEqual(det.equipamentosLista[0].patrimonio, 'V6-LIVRE');
  // Busca de ativos também encontra pelo e-mail do colaborador
  const busca = (await chamar('admin', 'GET', '/ativos?pagina=1&limite=10&q=paula.lima')).body;
  assert.ok(busca.itens.some((x) => x.patrimonio === 'V6-LIVRE'));
});

test('entrega com e-mail do colaborador cadastra a pessoa e vincula os equipamentos entregues', async () => {
  const s = (await chamar('rh', 'POST', '/solicitacoes', pedido({ nomeAdmitido: 'Clara Nunes', emailColaborador: 'clara.nunes@hco.com' }))).body;
  assert.strictEqual(s.emailColaborador, 'clara.nunes@hco.com');
  const invalido = await chamar('rh', 'PATCH', `/solicitacoes/${s.id}/colaborador`, { emailColaborador: 'clara@' });
  assert.strictEqual(invalido.status, 422);
  await chamar('admin', 'POST', `/solicitacoes/${s.id}/reservar-tudo`);
  await chamar('admin', 'PATCH', `/solicitacoes/${s.id}/status`, { status: 'Em preparação' });
  const e = await chamar('admin', 'PATCH', `/solicitacoes/${s.id}/status`, { status: 'Entregue' });
  assert.strictEqual(e.status, 200, JSON.stringify(e.body));
  assert.strictEqual(e.body.colaborador.email, 'clara.nunes@hco.com');
  const ativoId = e.body.itens[0].equipamentos[0].id;
  const a = (await chamar('admin', 'GET', `/ativos/${ativoId}`)).body;
  assert.strictEqual(a.colaborador.email, 'clara.nunes@hco.com');
  // O Solicitante vê o e-mail na própria solicitação, sem patrimônio
  const vista = (await chamar('rh', 'GET', `/solicitacoes/${s.id}`)).body;
  assert.strictEqual(vista.emailColaborador, 'clara.nunes@hco.com');
  assert.ok(!vista.itens[0].equipamentos[0].patrimonio);
});

// ---------------- Desempenho: paginação e contadores ----------------
test('lista de ativos paginada no servidor, com contagens por status e linhas enxutas', async () => {
  const r = (await chamar('admin', 'GET', '/ativos?pagina=1&limite=5&ordem=patrimonio')).body;
  assert.strictEqual(r.itens.length, 5);
  assert.ok(r.total > 5 && r.paginas > 1);
  assert.strictEqual(Object.values(r.contagens.porStatus).reduce((a, b) => a + b, 0), r.contagens.total);
  assert.ok(!('observacoes' in r.itens[0]) && 'proprietario' in r.itens[0], 'linha enxuta');
  const emUso = (await chamar('admin', 'GET', '/ativos?pagina=1&limite=50&status=Em%20uso')).body;
  assert.ok(emUso.itens.every((a) => a.status === 'Em uso'));
  assert.strictEqual(emUso.contagens.total, r.contagens.total, 'abas continuam mostrando o total de cada status');
  const b2f = (await chamar('admin', 'GET', '/ativos?pagina=1&limite=50&proprietario=H%26CO%20B2Finance')).body;
  assert.ok(b2f.itens.length && b2f.itens.every((a) => a.proprietario === 'H&CO B2Finance'));
  const min = (await chamar('admin', 'GET', '/ativos?campos=min')).body;
  assert.deepStrictEqual(Object.keys(min[0]).sort(), ['categoria', 'id', 'nome', 'patrimonio', 'proprietario', 'status']);
});

test('contadores leves do menu: só para o Operador', async () => {
  const c = (await chamar('admin', 'GET', '/contadores')).body;
  assert.strictEqual(c.operador, true);
  for (const k of ['novas', 'emPreparacao', 'emTransito', 'agenda', 'estoque', 'alertas']) assert.ok(k in c, k);
  assert.ok(c.alertas.every((a) => Object.keys(a).length === 2), 'só id e severidade');
  assert.deepStrictEqual((await chamar('rh', 'GET', '/contadores')).body, { operador: false });
});

// ---------------- Importação ----------------
test('importação .xlsx: mapeia colunas, valida, detecta duplicados e só grava após confirmar', async () => {
  assert.strictEqual((await enviarArquivo('rh', path.join(FIX, 'inventario-sharepoint.xlsx'))).status, 403);
  const totalAntes = (await chamar('admin', 'GET', '/ativos?pagina=1&limite=1')).body.contagens.total;
  const a = await enviarArquivo('admin', path.join(FIX, 'inventario-sharepoint.xlsx'));
  assert.strictEqual(a.status, 201, JSON.stringify(a.body));
  const id = a.body.id;
  const mapa = Object.fromEntries(a.body.colunas.map((c) => [c.nome, c.campo]));
  assert.strictEqual(mapa['Asset Tag'], 'patrimonio');
  assert.strictEqual(mapa['Serial Number'], 'numeroSerie');
  assert.strictEqual(mapa.Owner, 'proprietario');
  assert.strictEqual(mapa.Email, 'colaboradorEmail');
  const t = a.body.totais;
  assert.strictEqual(t.linhas, 7);
  assert.strictEqual(t.erros, 3, 'patrimônio repetido, status e proprietário desconhecidos');
  assert.strictEqual(t.existentes, 1);
  assert.strictEqual(t.criar, 3);
  // Nada gravado ainda
  assert.strictEqual((await chamar('admin', 'GET', '/ativos?pagina=1&limite=1')).body.contagens.total, totalAntes);

  // Prévia filtrada e linha com valores padronizados
  const erros = (await chamar('admin', 'GET', `/importacao/${id}/previa?filtro=erros`)).body;
  assert.strictEqual(erros.linhas.length, 3);
  assert.ok(erros.linhas.some((l) => /repetido/.test(l.erros.patrimonio)));
  const todas = (await chamar('admin', 'GET', `/importacao/${id}/previa`)).body.linhas;
  const l2 = todas.find((l) => l.n === 2);
  assert.deepStrictEqual([l2.dados.categoria, l2.dados.status, l2.dados.proprietario, l2.dados.dataAquisicao, l2.dados.valor], ['Notebook', 'Em uso', 'H&CO', '2024-03-10', 7500.5]);
  assert.ok(l2.colaborador.novo && l2.colaborador.email === 'ana.teste@hco.com');
  const l3 = todas.find((l) => l.n === 3);
  assert.strictEqual(l3.dados.proprietario, 'H&CO B2Finance');
  assert.ok(l3.avisos.some((x) => /Nome montado/.test(x)));
  const l6 = todas.find((l) => l.n === 6);
  assert.strictEqual(l6.dados.patrimonio, 'SNIMP005', 'sem patrimônio: usa o número de série');
  assert.strictEqual(l6.dados.dataAquisicao, '2023-12-31');

  // Relatório de correções (CSV) antes de importar
  const rel = await fetch(`${ctx.base}/importacao/${id}/relatorio.csv`, { headers: { Authorization: `Bearer ${ctx.tokens.admin}` } });
  const csv = await rel.text();
  assert.match(csv, /Linha;Situação;Problemas/);
  assert.match(csv, /Quebrado mesmo/);

  // Correção manual de uma linha (status) e decisão para o duplicado
  const fix = await chamar('admin', 'PATCH', `/importacao/${id}/linhas/7`, { valores: { status: 'Em manutenção' } });
  assert.strictEqual(fix.body.linha.situacao, 'novo');
  assert.strictEqual(fix.body.linha.dados.status, 'Em manutenção');
  const dup = await chamar('admin', 'PATCH', `/importacao/${id}/linhas/4`, { decisao: 'atualizar' });
  assert.strictEqual(dup.body.linha.acao, 'atualizar');
  assert.deepStrictEqual(dup.body.linha.diferencas.map((d) => d.campo), ['localizacao']);

  // Confirmação exige a versão atual da prévia
  assert.strictEqual((await chamar('admin', 'POST', `/importacao/${id}/confirmar`, { confirmar: true, versao: 1 })).status, 409);
  const ok = await chamar('admin', 'POST', `/importacao/${id}/confirmar`, { confirmar: true, versao: dup.body.versao });
  assert.strictEqual(ok.status, 201, JSON.stringify(ok.body));
  assert.deepStrictEqual([ok.body.totais.criados, ok.body.totais.atualizados, ok.body.totais.erros, ok.body.totais.colaboradoresCriados], [4, 1, 2, 1]);
  const imp1 = (await chamar('admin', 'GET', '/ativos?pagina=1&limite=5&q=IMP-001')).body.itens[0];
  assert.strictEqual(imp1.colaborador.email, 'ana.teste@hco.com');
  const monitor = (await chamar('admin', 'GET', '/ativos?pagina=1&limite=5&q=TI-0003')).body.itens[0];
  assert.strictEqual(monitor.localizacao, 'Almoxarifado novo');
  // A sessão termina; o histórico registra e oferece o relatório e o "desfazer"
  assert.strictEqual((await chamar('admin', 'GET', `/importacao/${id}/previa`)).status, 404);
  const hist = (await chamar('admin', 'GET', '/importacao')).body;
  assert.strictEqual(hist[0].id, ok.body.id);
  const relFinal = await (await fetch(`${ctx.base}/importacao/historico/${ok.body.id}/relatorio.csv`, { headers: { Authorization: `Bearer ${ctx.tokens.admin}` } })).text();
  assert.match(relFinal, /Atualizado;TI-0003;"localizacao/);
  assert.match(relFinal, /status = Em manutenção/, 'correções feitas na revisão ficam registradas');
  assert.match(relFinal, /Proprietário ""Empresa X"" não reconhecido/);
  const auditoria = (await chamar('admin', 'GET', '/historico?entidade=importacao')).body;
  assert.ok(auditoria.some((h) => h.acao === 'importou'));

  // Desfazer: remove os criados e restaura o que foi alterado
  const d = await chamar('admin', 'POST', `/importacao/historico/${ok.body.id}/desfazer`);
  assert.deepStrictEqual([d.body.removidos, d.body.restaurados], [4, 1]);
  assert.strictEqual((await chamar('admin', 'GET', '/ativos?pagina=1&limite=5&q=TI-0003')).body.itens[0].localizacao, 'Almoxarifado TI');
  assert.strictEqual((await chamar('admin', 'GET', '/ativos?pagina=1&limite=1')).body.contagens.total, totalAntes);
  assert.strictEqual((await chamar('admin', 'POST', `/importacao/historico/${ok.body.id}/desfazer`)).status, 409);
});

test('importação .csv do Desk Manager (Windows-1252, ";"), com proprietário padrão e mapeamento manual', async () => {
  const a = await enviarArquivo('admin', path.join(FIX, 'deskmanager.csv'));
  assert.strictEqual(a.status, 201, JSON.stringify(a.body));
  assert.strictEqual(a.body.separador, ';');
  const linhas = (await chamar('admin', 'GET', `/importacao/${a.body.id}/previa`)).body.linhas;
  assert.strictEqual(linhas[0].dados.proprietario, 'H&CO B2Finance');
  assert.strictEqual(linhas[0].dados.valor, 4599.9);
  assert.strictEqual(linhas[0].dados.dataAquisicao, '2024-02-15');
  assert.strictEqual(linhas[1].dados.nome, 'Notebook Dell; 16 GB', 'campo entre aspas com ";"');
  assert.strictEqual(linhas[2].dados.status, 'Disponível');
  // Desmapear a coluna de proprietário exige um padrão
  const mapeamento = Object.fromEntries(a.body.colunas.map((c) => [c.nome, c.campo === 'proprietario' ? '' : c.campo]));
  const sem = (await chamar('admin', 'PUT', `/importacao/${a.body.id}/configuracao`, { mapeamento })).body;
  assert.ok(sem.faltando.some((f) => /Proprietário/.test(f)));
  assert.strictEqual(sem.totais.erros, 3);
  const com = (await chamar('admin', 'PUT', `/importacao/${a.body.id}/configuracao`, { opcoes: { proprietarioPadrao: 'H&CO' } })).body;
  assert.strictEqual(com.faltando.length, 0);
  assert.strictEqual(com.totais.criar, 3);
  const ok = await chamar('admin', 'POST', `/importacao/${a.body.id}/confirmar`, { confirmar: true, versao: com.versao });
  assert.strictEqual(ok.status, 201);
  const nb = (await chamar('admin', 'GET', '/ativos?pagina=1&limite=5&q=NB-500')).body.itens[0];
  assert.strictEqual(nb.proprietario, 'H&CO');
  assert.strictEqual(nb.colaborador.email, 'joao.silva@hco.com');
});

test('importação recusa arquivos inválidos e limita o acesso a quem pode cadastrar', async () => {
  assert.strictEqual((await enviarArquivo('admin', Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0]), 'antigo.xls')).status, 422);
  assert.strictEqual((await enviarArquivo('admin', Buffer.from('PK\x03\x04lixo'), 'falso.xlsx')).status, 422);
  assert.strictEqual((await enviarArquivo('admin', Buffer.from('so;cabecalho\r\n'), 'vazio.csv')).status, 422);
  assert.strictEqual((await chamar('rh', 'GET', '/importacao')).status, 403);
  assert.strictEqual((await chamar('admin', 'GET', '/importacao/00000000-0000-0000-0000-000000000000/previa')).status, 404);
});

test('migração v5 → v6 preserva os dados e define o proprietário padrão', () => {
  const arquivo = path.join(ctx.tmpDir, 'v5.json');
  const v5 = {
    versao: 5, rev: 3, config: { licencas: { total: 5 } }, seq: { solicitacao: 1000 },
    ativos: [{ id: 'a1', patrimonio: 'OLD-1', nome: 'Notebook antigo', categoria: 'Notebook', status: 'Disponível', tags: [], valor: 0, reservadoPara: null }],
    estoqueItens: [{ id: 'i1', nome: 'Mouse', categoria: 'Periférico', quantidade: 2, reservado: 0 }],
    solicitacoes: [{ id: 's1', numero: 'SOL-1', status: 'Pendente', nomeAdmitido: 'X', itens: [{ id: 'l1', tipo: 'ativo', categoria: 'Notebook', quantidade: 1, ativoIds: [] }], entrega: retirada, criadoEm: new Date().toISOString() }],
    movimentacoes: [{ id: 'm1', itemId: 'i1', tipo: 'entrada' }], usuarios: [], sessoes: [], historico: [], eventos: [], conferencias: [], notificacoes: []
  };
  fs.writeFileSync(arquivo, JSON.stringify(v5));
  const out = execFileSync(process.execPath, ['-e', `
    const db = require(${JSON.stringify(path.join(__dirname, '..', 'src', 'db.js'))});
    console.log(JSON.stringify({ v: db.list('versao'), a: db.list('ativos')[0], i: db.list('estoqueItens')[0].proprietario, s: db.list('solicitacoes')[0], m: db.list('movimentacoes')[0].proprietario, c: db.list('colaboradores'), h: db.list('historico')[0] }));
  `], { env: { ...process.env, DATA_FILE: arquivo } }).toString();
  const r = JSON.parse(out);
  assert.strictEqual(r.v, 6);
  assert.strictEqual(r.a.proprietario, 'H&CO');
  assert.strictEqual(r.a.nome, 'Notebook antigo');
  assert.strictEqual(r.a.colaboradorId, null);
  assert.strictEqual(r.i, 'H&CO');
  assert.strictEqual(r.s.proprietario, 'H&CO');
  assert.strictEqual(r.s.itens[0].proprietario, 'H&CO');
  assert.strictEqual(r.m, 'H&CO');
  assert.deepStrictEqual(r.c, []);
  assert.match(r.h.detalhe, /1 equipamento/);
});

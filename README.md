# Ativos Tech 6.0 — Solicitações, Estoque e Envios de Equipamentos

Plataforma de **logística de equipamentos de TI** da H&CO: o **RH** pede notebook e acessórios para cada nova admissão, a **TI** recebe o aviso (visual, por e-mail e — opcional — sonoro), reserva os itens sem duplicidade, prepara, **despacha com transportadora e rastreio** e confirma a entrega — o RH acompanha tudo em tempo real.

**Novidades da 6.0:** proprietário do equipamento (**H&CO** × **H&CO B2Finance**, estoques nunca misturados), **colaboradores** identificados pelo e-mail corporativo, **importação de planilhas** (CSV/Excel do Desk Manager, SharePoint…) com prévia e confirmação, e uma interface **silenciosa, enxuta e mais rápida** (medições na seção *Desempenho*).

## Como rodar no VS Code

**Pré-requisito:** Node.js **20.9 ou superior** (`node -v`).

```bash
npm run setup     # instala tudo (raiz, api e web)
```

**Crie o administrador inicial** (não existem contas de demonstração). Escolha uma das formas:

- **Comando interativo (recomendado — a senha não fica em arquivo):**
  ```bash
  npm run criar-admin   # pede e-mail, nome e senha sem exibi-la (pode rodar com a API aberta)
  ```
- **Variáveis de ambiente:** copie `api/.env.example` para `api/.env`, preencha `ADMIN_EMAIL` e `ADMIN_INITIAL_PASSWORD` e suba a API. A conta é criada uma única vez; depois **apague** o valor de `ADMIN_INITIAL_PASSWORD`.

Em ambos os casos a senha é gravada só como hash (scrypt) e o sistema **exige a troca no primeiro acesso**.

```bash
npm run dev       # desenvolvimento, só neste computador: sobe API (3001) e front-end (3000)
```
Acesse **http://localhost:3000** → prefixo **H&CO** → **Acessar como Operador (TI)** → entre com o administrador inicial e crie a sua senha. Depois cadastre os demais usuários em **Gestão → Usuários**.

```bash
npm test       # 76 testes automatizados da API (fluxo, RBAC, licenças, e-mail SMTP real, login Microsoft, proprietário, colaboradores, importação, migrações)
npm run seed   # restaura os dados de exemplo de equipamentos/estoque/solicitações (usuários e licenças são mantidos)
```
O arquivo `api/requests.http` tem as requisições prontas para a extensão **REST Client**.

## Usar em vários computadores (modo servidor)

O Ativos Tech é um sistema web: ele roda em **um único servidor** e todas as pessoas abrem **o mesmo endereço** no navegador. Usuários, equipamentos e solicitações ficam num só banco de dados (`api/data/db.json`, no servidor).

> ⚠️ **Não instale uma cópia em cada computador.** Cada cópia cria o seu próprio banco: a conta criada no PC não existe na cópia do notebook (aparece "E-mail ou senha incorretos") e os dados nunca se encontram. Nos outros computadores basta o navegador.

No computador ou servidor que vai ficar ligado:

```bash
npm run setup
npm run servidor   # prepara o site (build) e inicia API + site em modo produção
```
1. **Windows — liberar a porta 3000 na rede** (uma vez, PowerShell como administrador):
   `powershell -ExecutionPolicy Bypass -File .\scripts\windows\liberar-acesso-rede.ps1` — o script mostra os endereços deste computador (ex.: `http://192.168.0.10:3000`).
2. Crie `api/.env` (a partir de `api/.env.example`) com `APP_URL=` esse endereço — ele aparece nos links dos e-mails e no login Microsoft. Reinicie.
3. Nos outros computadores, abra o endereço no navegador e entre com a mesma conta. Em **Configurações → Dados**, o administrador vê o endereço para compartilhar.

Como funciona: o navegador só conversa com o endereço do site; o site repassa `/api` para a API, que escuta apenas no próprio servidor (`127.0.0.1:3001`). Não há `localhost` fixo no código, a porta da API não fica exposta e não é preciso liberar CORS. Para acesso fora da rede da empresa, publique com HTTPS (veja `docs/DEPLOYMENT.md`: VM/servidor com Docker, Cloudflare Tunnel).

> **Atualizando da versão 5?** Descompacte por cima e rode `npm run setup`. Na primeira execução o banco é migrado para a v6 **sem perder dados**: todo equipamento, acessório, solicitação e movimentação existente recebe o proprietário **H&CO** (registrado na Atividade). Corrija o que for da B2Finance em **Inventário → filtro → selecionar → Proprietário** (ação em lote).
>
> **Atualizando da versão 4?** Não precisa apagar nada: na primeira execução o banco é migrado. As antigas contas de demonstração (`…@ativotech.local`) ficam **desativadas, sem senha e com licença suspensa** (o histórico delas é preservado), as sessões antigas são encerradas e Operadores já existentes viram administradores.

---

## Acesso

1. **Tela inicial (`/acesso`)**: informe o **prefixo da empresa** (por enquanto só `H&CO`; outros são recusados pela API) e escolha **Acessar como Solicitante (RH)** ou **Acessar como Operador (TI)**.
2. **Login (`/login?perfil=…`)**: **Entrar com a Microsoft** ou **e-mail e senha**.
3. O servidor confere, no login **e em toda requisição**: empresa, **portal escolhido = perfil do usuário**, conta ativa e **licença ativa**. Um Solicitante não vira Operador mudando a URL ou a interface — a sessão carrega o portal e a API recusa qualquer rota fora dele.
4. Senha temporária (primeiro acesso ou redefinida pelo administrador) → tela obrigatória **Crie a sua senha**; até lá, a API bloqueia todo o resto.

Política de senha: 10+ caracteres, maiúscula, minúscula, número e símbolo; a nova precisa ser diferente da atual. Alterar a senha encerra as sessões em outros dispositivos. A própria senha se troca em **Configurações → Alterar senha**.

## Perfis e permissões

| | Solicitante (RH) | Operador (TI) | Operador administrador |
|---|:-:|:-:|:-:|
| Abrir e acompanhar as próprias solicitações | ✔ | ✔ | ✔ |
| Estoque | Resumido | Completo | Completo |
| Analisar, reservar, preparar, enviar, confirmar entrega | — | ✔ | ✔ |
| Equipamentos, entradas/saídas/ajustes de estoque | — | ✔ | ✔ |
| Alerta de nova solicitação | — | ✔ | ✔ |
| **Gerenciamento de Usuários e licenças** | — | — | ✔ |
| Notificações por e-mail (configuração e fila), backup | — | — | ✔ |

Ninguém promove a si mesmo: perfil e permissão administrativa só mudam por **outro** administrador, e o sistema sempre mantém pelo menos um administrador ativo com licença.

## Gerenciamento de Usuários e licenças (`/usuarios`)

- Criar usuário: nome, e-mail corporativo (`@hco.com`, configurável), perfil, permissão administrativa (Operador), departamento, licença e primeiro acesso — **senha temporária gerada** (mostrada uma única vez), **definida pelo administrador** ou **somente conta Microsoft**.
- Editar, ativar/desativar, **redefinir senha** (gera temporária e exige troca), remover bloqueio por tentativas.
- Lista com perfil, situação da conta (ativa, desativada, sem licença, bloqueada por tentativas, troca de senha pendente), **licença**, **criado em**, **último acesso**, sessões e quem está conectado agora. Filtros: ativos, bloqueados, Operadores, Solicitantes.
- **Licenças**: ativa (ocupa vaga), pendente, suspensa, expirada (validade vencida). O painel mostra **contratadas, em uso e disponíveis**; o limite nunca é ultrapassado e não dá para reduzir abaixo do que está em uso. Suspender ou desativar derruba o acesso na hora, e a pessoa vê o motivo na tela de login.
- O controle é **interno** (`api/src/licencas.js`), com um adaptador de provedor pronto para trocar por um serviço externo no futuro.

## Notificações por e-mail (`/notificacoes`)

- **Nova solicitação** → e-mail para os Operadores: solicitante, colaborador, data de admissão, data de abertura, número e **link direto**.
- **Interação da TI** (status, mensagem, envio, previsão) → e-mail para o Solicitante: número, resumo, novo status, responsável e link. Mensagens e cancelamentos do RH avisam os Operadores. Notas internas e reservas **não** geram e-mail.
- Envio automático em segundo plano, **sem duplicidade** (uma chave por interação e destinatário), até 3 tentativas, status registrado (enviado, na fila, falhou, não configurado) e reenvio pelo painel. Cada pessoa pode desligar os e-mails em Configurações.
- **Sem serviço configurado, nada é simulado**: a fila registra "não configurado", a API registra o aviso no log (sem segredos) e os administradores veem um alerta no painel.

## Proprietário do equipamento (H&CO × H&CO B2Finance)

- Campo **obrigatório** em equipamentos e acessórios. Cada empresa tem o **seu** estoque: disponibilidade, reservas, demanda da fila, alertas de falta, movimentações e conferência física são calculados por proprietário.
- **Solicitação:** o RH escolhe primeiro de qual empresa são os equipamentos e só vê o estoque dela (“H&CO — 5 disponíveis”, “H&CO B2Finance — 4 disponíveis”). A API recusa misturar: acessório de outra empresa, reserva de notebook de outra empresa (mensagem clara) e a reserva automática só escolhe do proprietário certo.
- **TI:** filtro por proprietário no Inventário, Estoque (todas as abas), Solicitações e Quadro; totais gerais e por empresa; troca de proprietário em lote (bloqueada para itens reservados, com movimentação registrada); exportação CSV com a coluna.

## Colaboradores (`/colaboradores`)

- Cadastro de quem recebe os equipamentos: nome, **e-mail corporativo** (único), empresa, cargo, departamento, matrícula, localidade.
- **Alocar** um equipamento: no cadastro/edição ou no botão **Alocar** do equipamento — busca por nome/e-mail ou cadastro rápido de um colaborador novo. O equipamento passa a “Em uso” vinculado à pessoa.
- **Solicitação:** o RH informa o e-mail corporativo (opcional). Na **entrega**, o colaborador é cadastrado (ou reaproveitado pelo e-mail) e os equipamentos entregues ficam vinculados a ele. A TI pode corrigir o e-mail depois — inclusive após a entrega.
- Ficha do colaborador com os equipamentos em posse e as solicitações. Permissões: só a TI consulta e altera o cadastro; o Solicitante vê apenas o e-mail informado nas próprias solicitações (sem patrimônio). Domínios aceitos configuráveis em `EMAIL_DOMINIOS_COLABORADORES`.

## Importação de equipamentos (`/ativos/importar`)

1. **Arquivo:** arraste ou escolha um **.csv** (`;`, `,` ou tabulação, UTF-8 ou Windows-1252) ou **.xlsx** — até 12 MB / 10.000 linhas. O `.xlsx` é lido no servidor sem bibliotecas externas, com limites contra arquivos maliciosos.
2. **Colunas:** reconhecimento automático por nome e conteúdo (ex.: “Serial Number” → Número de série, “Asset Tag” → Patrimônio, “Owner”/“B2finance - TI INFRA” → Proprietário, coluna de e-mails → colaborador), com ajuste manual. Regras: proprietário padrão, o que fazer com equipamentos que já existem (**ignorar**, **completar campos vazios** ou **atualizar**), status quando vazio, usar o nº de série quando faltar patrimônio, cadastrar colaboradores pelo e-mail.
3. **Revisão:** cada linha já padronizada (status, categoria, proprietário, datas dd/mm/aaaa ou serial do Excel, valores “R$ 1.234,56”), com filtros (novos, a atualizar, com erro, com aviso), **duplicidades** no arquivo e no cadastro (por patrimônio e série), “o que vai mudar” campo a campo, **correção da linha** na própria tela e **relatório de correções (CSV)**.
4. **Confirmação:** resumo do que será criado/alterado; nada é gravado antes. A confirmação confere que a prévia vista é a atual. **Valores vazios nunca apagam dados.**
5. **Resultado e auditoria:** resumo (criados, atualizados, ignorados, erros), relatório final por linha (com valores originais, antes/depois e correções feitas), registro na Atividade e **desfazer** (remove os criados e restaura os campos alterados, preservando o que mudou depois).

## Fluxo da solicitação

1. **RH abre** a solicitação: **empresa (proprietário)**, nome e e-mail corporativo do colaborador, cargo, departamento, data de admissão, **itens** (notebook, monitor, smartphone, tablet e acessórios como mouse, teclado, headset, mochila, dock — com quantidade e especificação), **entrega** (envio para endereço com CEP/rua/número/complemento/bairro/cidade/UF/destinatário/telefone, com preenchimento automático pelo CEP, ou retirada numa unidade) e observações. O número **SOL-xxxx** é gerado automaticamente.
2. **TI é avisada na hora** (canal em tempo real): aviso discreto com botão "Abrir", alerta sonoro curto (pode ser desligado), contador de pendentes, destaque "NOVA" e, opcionalmente, notificação do sistema operacional com a aba em segundo plano. Ao abrir a solicitação, o destaque some para toda a equipe.
3. **Pendente → Em análise.** A TI reserva os itens (um a um ou "Reservar tudo"). Sem estoque, a solicitação vai para **Aguardando estoque**.
4. **Em preparação** só com todos os itens reservados.
5. **Enviado:** exige transportadora e data de envio; código de rastreio e previsão são opcionais. Os equipamentos passam a "Enviado" (em trânsito) e os acessórios saem do estoque. O RH recebe o rastreio na hora.
6. **Entregue:** registra quem recebeu; os equipamentos viram "Em uso" com o colaborador como responsável. Retirada na unidade vai direto de "Em preparação" para "Entregue".

**Status:** Pendente · Em análise · Aguardando estoque · Em preparação · Enviado · Entregue (· Cancelado). As transições são validadas pela API. O RH pode cancelar até "Aguardando estoque"; a TI pode rejeitar até antes do envio; cancelar/rejeitar devolve tudo ao estoque.

## Telas

| Perfil | Página | Rota |
|---|---|---|
| TI | **Painel** — fila de entrada, para despachar, em trânsito, estoque para pedidos, indicadores | `/` |
| TI | **Solicitações** — fila com abas (novas, pendentes, aguardando estoque, preparação, enviadas…), progresso de reserva | `/solicitacoes` |
| TI | **Envios** — prontos para despachar, retiradas, em trânsito (rastreio, atrasos), entregues | `/envios` |
| TI | **Estoque** — visão geral, equipamentos, acessórios (entrada/saída/ajuste), reservas, movimentações, conferência física | `/estoque` |
| TI | **Usuários** — criar, editar, ativar/desativar, redefinir senha, quem está conectado, matriz de permissões | `/usuarios` |
| TI | **Inventário** (paginado, filtro por proprietário, ações em lote) · **Importar** | `/ativos` · `/ativos/importar` |
| TI | **Colaboradores** — e-mail corporativo, equipamentos em posse, solicitações | `/colaboradores` |
| TI | Inventário, Quadro, Agenda (admissões + previsões de entrega), Alertas, Relatórios, Atividade | |
| RH | Início · Nova solicitação · Minhas solicitações · Estoque disponível | `/portal…` |
| Ambos | Detalhe da solicitação (etapas, itens, destino, rastreio, mensagens) | `/solicitacoes/:id` · `/portal/solicitacoes/:id` |

## Estoque sem divergências
- **Equipamentos com patrimônio** (notebook, monitor, smartphone, tablet): cada unidade é um ativo. Situação derivada: disponível, reservado, em preparação, enviado, em uso, manutenção, baixado.
- **Acessórios por quantidade**: em estoque, reservado e disponível (= estoque − reservado), com **estoque mínimo** e alerta de reposição.
- **Entradas, saídas e ajustes** com motivo; saída nunca maior que o disponível e ajuste nunca abaixo do reservado. Toda reserva, liberação, envio e entrega gera **movimentação** no histórico.
- **Reservas atômicas**: verificação e gravação sem intervalo — testado com 5 reservas simultâneas do mesmo notebook (só uma vence) e com acessórios em paralelo (nunca reserva além do estoque).
- Equipamento reservado fica travado (não muda de status nem é excluído por fora do fluxo).
- Verificação de **integridade** (reservas ↔ solicitações ↔ quantidades) na tela de estoque, com alerta crítico em caso de divergência.

## Tempo real
- `GET /api/stream` (Server-Sent Events) lido com `fetch` e o token no cabeçalho `Authorization` (nunca na URL).
- Eventos: `rev` (qualquer alteração — as telas recarregam), `solicitacao:nova` (só Operadores), `solicitacao:status` e `solicitacao:mensagem` (Operadores e o dono), `solicitacao:vista`.
- Reconexão automática com espera crescente; enquanto o canal está fora, o app consulta `GET /api/sync` a cada 4 s. O indicador no topo mostra **Ao vivo / Sincronizando / Offline**.
- A sessão é revalidada a cada 20 s no canal: usuário desativado é desconectado na hora.
- **Configurações → Alerta de novas solicitações:** liga/desliga o único som do sistema, volume, repetição a cada 5 min (desligada por padrão) e notificação do sistema operacional.

## Interface silenciosa e desempenho

- **Sem sons** em cliques, abas, janelas, salvamentos ou atualizações. O único som é o alerta de nova solicitação para a TI (desligável). Sem confete, contadores animados, entradas escalonadas ou gráficos “desenhando”; transições de ~0,15 s (desligáveis em Configurações).
- **Avisos discretos:** pequenos, sem barra de tempo, somem em 2,6 s (confirmações) a 7 s (erros), no máximo 3 na tela e sem repetição da mesma mensagem. Avisos persistentes só para o que exige ação (nova solicitação, e-mail não configurado, divergência de estoque). Alertas repetitivos (ex.: 300 garantias vencidas) viram **um** alerta com o total e link para a lista filtrada.
- **Menos informação por tela:** painel com o que pede ação (fila, atenção, despachar, trânsito); gráficos, semana, agenda e atividade em **Mais indicadores**. Rede, compra/garantia e observações recolhíveis no formulário do equipamento. Indicadores em uma linha compacta.
- **Desempenho real:** contadores do menu numa resposta de ~1 KB (`/api/contadores`) em vez do painel inteiro + todos os alertas; inventário **paginado no servidor**; cache de leitura no navegador válido enquanto a revisão dos dados não muda (trocar de tela e voltar não refaz requisições) e unificação de pedidos iguais; recargas agrupadas e adiadas com a aba oculta; abas secundárias e histórico carregados só quando abertos; índice por id, cálculos reaproveitados por revisão e gravação compacta no servidor.

| Medição (base com 3.024 equipamentos e 308 solicitações) | v5 | v6 |
|---|---:|---:|
| Painel: requisições / dados ao abrir | 10 / 1,5 MB | 5 / 15 KB |
| Inventário: requisições / dados / tabela visível | 7 / 3,3 MB / 546 ms | 5 / 17 KB / 227 ms |
| Estoque: dados ao abrir | 1,5 MB | 16 KB |
| Solicitações: dados ao abrir | 2,1 MB | 18 KB |
| 3 alterações feitas por outra pessoa com o painel aberto | 72 requisições / 13,5 MB | 6 / 28 KB |
| Painel → Inventário pelo menu | 556 ms / 2,7 MB | 323 ms / 15 KB |
| API: gravar um equipamento | 66,6 ms | 31,1 ms |
| API: `/alertas` | 536 KB | 2,4 KB |
| Arquivo de dados | 4,2 MB | 3,3 MB |

## Segurança
- Senhas com **scrypt + salt**; tokens aleatórios de 256 bits (no banco fica só o hash SHA-256); sessão de 8 h.
- **Bloqueio após 5 tentativas** de login (5 min) e mensagem de erro genérica.
- Conta, licença e perfil são revalidados a cada requisição; redefinir a senha **encerra as sessões**. O sistema exige ao menos um administrador ativo e impede o administrador de remover o próprio acesso.
- Login Microsoft com **Authorization Code + PKCE**, state e nonce de uso único, validação do id_token (assinatura RS256 pelas chaves da Microsoft, emissor, audiência, tenant, validade). O token da sessão chega ao navegador por um código de uso único no fragmento da URL — nunca na query string.
- Credenciais (senha inicial, SMTP, client secret) só em variáveis de ambiente / `api/.env` (ignorado pelo git); nunca em logs nem nas respostas da API.
- **Auditoria** com usuário, perfil e IP. Cabeçalhos `nosniff`, `X-Frame-Options`, `no-store`; validação no front **e** na API.

> Importação: o arquivo é lido em memória, nunca executado nem gravado como enviado; células são limitadas a 500 caracteres; o relatório CSV neutraliza fórmulas; só Operadores com permissão de cadastro importam, e cada importação fica na auditoria (detalhe em `api/data/importacoes/`).
>
> Em produção: use HTTPS, defina `APP_URL` com o endereço real e considere um banco relacional. `CORS_ORIGIN` e `API_PUBLIC_URL` só são necessários se a API for publicada em outro domínio.

## Principais endpoints

| Método | Rota | Quem | Descrição |
|---|---|---|---|
| GET | `/api/auth/empresa?prefixo=` · `/api/auth/metodos` | público | Valida o prefixo · métodos de login disponíveis |
| POST | `/api/auth/login` | público | `{ email, senha, prefixo, perfil: ti\|rh }` |
| GET | `/api/auth/microsoft/iniciar` · `/callback` | público | Login Microsoft (OIDC + PKCE) |
| POST | `/api/auth/microsoft/trocar` | público | Código de uso único → sessão |
| POST · PATCH | `/api/auth/logout` · `/senha` · `/preferencias` | logado | Sair, trocar a própria senha, e-mails sim/não |
| GET | `/api/stream` · `/api/sync` | logado | Canal em tempo real · revisão atual |
| GET · POST | `/api/solicitacoes` | RH/TI | Lista (`?status=ativas\|novas\|…`) · abre solicitação |
| GET | `/api/solicitacoes/catalogo` | RH/TI | O que pode ser pedido e quanto há disponível |
| GET | `/api/solicitacoes/:id` | quem pode ver | Detalhe (notas e patrimônios só para TI) |
| POST | `/api/solicitacoes/:id/atualizacoes` · `/cancelar` | dono/TI | Mensagem · cancelamento |
| POST | `/api/solicitacoes/:id/visto` | TI | Marca como aberta (tira o "NOVA") |
| PATCH | `/api/solicitacoes/:id/status` | TI | `{ status, mensagem, envio?, recebidoPor? }` |
| PUT | `/api/solicitacoes/:id/itens/:linha` | TI | Reserva `{ ativoIds }` ou `{ quantidade }` |
| POST | `/api/solicitacoes/:id/reservar-tudo` · `/rejeitar` · `/notas` | TI | Reserva automática · rejeitar · nota interna |
| PATCH | `/api/solicitacoes/:id/envio` · `/previsao` | TI | Dados de envio · previsão de entrega |
| GET | `/api/estoque/resumo?proprietario=&detalhe=0` | RH/TI | Indicadores por proprietário (resumido para o RH) |
| GET | `/api/ativos?pagina=1&limite=25&proprietario=&q=&status=` | TI | Inventário paginado (`campos=min\|lista` para seletores e quadro) |
| POST | `/api/ativos/lote` | TI | `{ ids, acao: status\|proprietario\|excluir }` |
| GET · POST · PUT | `/api/colaboradores` · `/:id` · `/:id/equipamentos` | TI | Cadastro, ficha e vínculo com equipamentos |
| PATCH | `/api/solicitacoes/:id/colaborador` | dono/TI | E-mail corporativo do colaborador |
| POST | `/api/importacao/analisar` | TI | Arquivo (corpo binário, cabeçalho `X-Arquivo-Nome`) → prévia |
| GET · PUT · PATCH | `/api/importacao/:id/previa` · `/configuracao` · `/linhas/:n` | TI | Prévia paginada · mapeamento e regras · correção de linha |
| POST · GET | `/api/importacao/:id/confirmar` · `/relatorio.csv` | TI | Gravar (`{ confirmar: true, versao }`) · correções |
| GET · POST | `/api/importacao` · `/historico/:id/relatorio.csv` · `/historico/:id/desfazer` | TI | Histórico, relatório final, desfazer |
| GET | `/api/contadores` | logado | Contadores do menu/sino (resposta pequena) |
| GET · POST · PUT | `/api/estoque/itens` · `/itens/:id` | TI | Acessórios por quantidade |
| POST | `/api/estoque/itens/:id/movimentar` | TI | `{ tipo: entrada\|saida\|ajuste, quantidade, motivo }` |
| GET | `/api/estoque/equipamentos` · `/movimentacoes` · `/consistencia` | TI | Detalhe · histórico · integridade |
| POST | `/api/estoque/conferencia` | TI | Conferência física |
| GET · POST · PUT | `/api/usuarios` · `/:id` | Admin | Usuários (`acesso: gerar\|definir\|microsoft`, `licenca`) |
| PATCH · POST | `/api/usuarios/:id/ativo` · `/licenca` · `/senha` · `/desbloquear` | Admin | Conta, licença, senha temporária, bloqueio |
| GET · PUT | `/api/licencas` | Admin | Contratadas, em uso, disponíveis · ajustar total |
| GET · POST | `/api/notificacoes` · `/status` · `/reenviar` · `/teste` | Admin | Fila de e-mails, configuração, reenvio, teste |

Códigos: **401** sem login · **403** sem permissão · **404** não encontrado/sem acesso · **409** conflito (reserva duplicada, estoque insuficiente, transição inválida) · **422** validação · **429** muitas tentativas de login.

## Estrutura

```
gestao-ativos-ti/
├── api/src/
│   ├── app.js · server.js     # Express: rotas públicas, autenticação, permissões por módulo
│   ├── config.js              # Variáveis de ambiente (api/.env)
│   ├── auth.js · senha.js     # Sessões com portal, perfis, permissões, política de senha, scrypt, bloqueio
│   ├── licencas.js            # Licenças (ativa/pendente/suspensa/expirada) e limite contratado
│   ├── administrador.js       # Administrador inicial (ADMIN_EMAIL) · criar-admin.js (comando interativo)
│   ├── microsoft.js           # Login Microsoft Entra ID (OIDC + PKCE, validação do id_token)
│   ├── email.js · notificacoes.js  # Envio SMTP/Microsoft Graph · fila com deduplicação e retentativas
│   ├── db.js · migracao.js    # Banco JSON com transações, índice e cache por revisão, tempo real, auditoria · migrações até a v6
│   ├── domain.js              # Regras e validações (solicitações, entrega, envio, itens de estoque, ativos)
│   ├── estoque.js             # Reservas atômicas por proprietário, envio, entrega, movimentações, integridade
│   ├── colaboradores.js       # Colaboradores (e-mail corporativo) e vínculo com equipamentos
│   ├── importacao/            # planilha.js (CSV/XLSX) · mapear.js (colunas e valores) · motor.js (prévia, gravação, desfazer)
│   └── routes/                # auth, usuarios, licencas, notificacoes, ativos, colaboradores, importacao, eventos, solicitacoes, estoque, painel, stream
├── api/tests/                 # api, portal, acesso, email (SMTP local), microsoft (OIDC local), v6 (proprietário, colaboradores, importação) · fixtures/
├── web/app/                   # acesso, login, trocar-senha, painel, solicitacoes, envios, estoque, usuarios, notificacoes, portal (RH)…
├── web/components/            # shell (menu, topo, alerta), portal (formulários, etapas, rastreio), ui
└── web/lib/                   # api.js (cache de leitura), hooks.js, tempoReal.js (canal SSE), sound.js (alerta), nav.js (rotas × permissões)
```

## Solução de problemas
- **"Não foi possível conectar ao servidor"** — confira se a API está rodando (porta 3001 no servidor). Para outra porta, defina `API_INTERNAL_URL` em `web/.env.local` e rode o build de novo.
- **"E-mail ou senha incorretos" só em outro computador** — esse computador está usando uma **cópia própria** do sistema (outro banco). Pare a cópia e abra o endereço do servidor (ex.: `http://192.168.0.10:3000`).
- **Sem apito** — clique uma vez na página (o botão "Ativar som dos alertas" aparece no topo enquanto o navegador bloquear o áudio) e confira *Configurações → Alerta de novas solicitações*.
- **Indicador "Sincronizando"** — o canal em tempo real caiu (proxy, rede); o app segue atualizando a cada 4 s e reconecta sozinho.
- **"Muitas tentativas"** no login — aguarde 5 minutos ou reinicie a API.
- **"E-mail ou senha incorretos" com a conta inicial** — olhe o terminal da API: cada login recusado mostra o motivo (`e-mail não cadastrado`, `senha diferente da cadastrada`…), sem expor a senha. Se a conta não existe, rode `npm run criar-admin`. A senha inicial do `.env` só vale na criação: se você já trocou a senha, use a nova (ou recupere com `npm run criar-admin`).
- **Esqueci a senha** — um Operador administrador redefine em Usuários. Se for o único administrador: rode `npm run criar-admin` com o mesmo e-mail (ele oferece recuperar o acesso).
- **"Prefixo não encontrado"** — o prefixo aceito é `H&CO`.
- **"Esta conta é de Operador/Solicitante"** — volte e escolha o outro portal; o perfil é validado no servidor.
- **"Sua licença…"** — um administrador precisa ativar a licença (Usuários → Licença).

## Configurações externas

### Login com Microsoft (Entra ID)
1. **Entra ID → Registros de aplicativo → Novo registro**: contas somente deste diretório; Redirect URI (**Web**) = `<APP_URL>/api/auth/microsoft/callback` (ex.: `https://ativos.hco.com/api/auth/microsoft/callback`).
2. **Certificados e segredos → Novo segredo do cliente**.
3. Em `api/.env`: `MS_TENANT_ID` (ID do diretório), `MS_CLIENT_ID` (ID do aplicativo), `MS_CLIENT_SECRET`, e `APP_URL` com o endereço real. Reinicie a API.
4. Cadastre as pessoas em **Usuários** com o mesmo e-mail da conta Microsoft (pode ser "somente conta Microsoft"). Quem não estiver cadastrado, ativo e licenciado é recusado mesmo autenticando na Microsoft.

### Envio de e-mails
- **Microsoft Graph (recomendado no Microsoft 365):** no mesmo registro (ou em outro), adicione a permissão de **aplicativo** `Mail.Send` (Microsoft Graph) e conceda consentimento de administrador. Em `api/.env`: `EMAIL_PROVEDOR=graph`, `EMAIL_REMETENTE` = caixa que envia (ex.: compartilhada). Restrinja o aplicativo a essa caixa com uma *Application Access Policy* no Exchange Online.
- **SMTP:** `EMAIL_PROVEDOR=smtp`, `SMTP_HOST`, `SMTP_PORTA`, `SMTP_USUARIO`, `SMTP_SENHA`, `EMAIL_REMETENTE` (no Microsoft 365: `smtp.office365.com:587` com SMTP AUTH habilitado na caixa).
- Reinicie a API e use **Notificações → Enviar teste para mim**; depois **Reenviar falhas** para o que ficou registrado sem configuração.

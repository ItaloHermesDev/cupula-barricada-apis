# Sistema de Gerenciamento e Proteção de APIs — BARRICADA

## 1. Visão geral

Desenvolver uma plataforma web para gerenciamento, proteção, monitoramento e intermediação de APIs externas, permitindo centralizar o acesso a serviços de terceiros por meio de rotas protegidas, chamadas de proxy e reformulação de respostas.

O sistema deverá permitir cadastrar APIs externas, configurar seus métodos, URLs, cabeçalhos e parâmetros, definir limites de utilização, controlar quais origens podem consumir cada rota e gerar automaticamente endpoints protegidos para utilização por aplicações autorizadas.

A plataforma será composta por dois conceitos principais:

- **API:** representa um serviço externo que será consumido pela plataforma, incluindo sua URL, método HTTP, cabeçalhos, parâmetros e configurações de acesso.
- **BARRICADA:** representa uma camada de proteção e intermediação que recebe as requisições, valida a autenticação e a origem, controla os limites de consumo, executa a chamada à API externa e transforma a resposta antes de entregá-la ao consumidor.

O objetivo é impedir o acesso direto e descontrolado às APIs externas, proteger credenciais, controlar custos e disponibilizar respostas padronizadas para as aplicações que utilizam a plataforma.

## 2. Gerenciamento de APIs

O sistema deverá permitir cadastrar e administrar múltiplas APIs externas.

Cada API deverá possuir as seguintes configurações:

- Nome e descrição.
- URL-base e endpoint externo.
- Método HTTP: GET, POST, PUT, PATCH ou DELETE.
- Cabeçalhos personalizados.
- Parâmetros de URL (query params).
- Parâmetros de rota, quando aplicável.
- Corpo da requisição, incluindo JSON e outros formatos compatíveis.
- Tipo de conteúdo da requisição e da resposta.
- Autenticação da API externa, quando necessária.
- Chaves e credenciais armazenadas de maneira segura.
- Timeout máximo da requisição.
- Status de ativação ou desativação.
- Configurações de tratamento de erros.
- Barricadas vinculadas à API.

Os cabeçalhos, parâmetros e corpos das requisições deverão aceitar valores fixos e variáveis dinâmicas, permitindo configurar quais informações serão recebidas do consumidor e enviadas ao serviço externo.

## 3. Gerenciamento de barricadas

Cada barricada deverá funcionar como um endpoint intermediário e protegido, associado a uma API externa.

Ao cadastrar uma barricada, o sistema deverá gerar uma rota própria para consumo, por exemplo:

`https://api.exemplo.com/barricada/instagram/perfil`

A rota deverá encaminhar as requisições ao serviço externo correspondente, respeitando todas as regras de segurança e transformação configuradas.

Cada barricada deverá possuir:

- Nome, descrição e identificador único.
- API externa associada.
- Endpoint público gerado automaticamente.
- Método HTTP permitido.
- Token exclusivo para autenticação.
- Lista de URLs ou origens autorizadas.
- Limite de chamadas por dia.
- Limites adicionais de requisições por minuto, quando configurados.
- Configuração dos parâmetros aceitos.
- Configuração dos cabeçalhos permitidos.
- Regras de transformação da resposta.
- Política de tratamento de erros.
- Status ativo ou inativo.
- Data de criação e última utilização.
- Configuração de barricada alternativa.

O token de cada barricada deverá ser independente, permitindo revogar ou renovar as credenciais de uma barricada sem afetar as demais.

## 4. Autenticação e controle de origem

Todas as chamadas às barricadas deverão passar por validações de segurança antes de executar qualquer requisição externa.

### 4.1. Token de acesso

Cada barricada deverá possuir um token secreto exclusivo, utilizado para autenticar as requisições recebidas.

O sistema deverá:

- Validar o token antes de executar a chamada externa.
- Rejeitar requisições com token ausente ou inválido.
- Permitir regenerar e revogar tokens.
- Não expor o token em respostas, logs ou mensagens de erro.
- Armazenar os tokens de maneira segura.
- Permitir que o token seja enviado por um cabeçalho HTTP, como `Authorization: Bearer <token>`.

### 4.2. URLs autorizadas

Cada barricada deverá permitir cadastrar as origens autorizadas a realizar chamadas.

A plataforma deverá validar a origem conforme a configuração de cada barricada.

Para aplicações web, poderá utilizar a política de CORS para controlar quais sites podem realizar requisições diretamente pelo navegador.

Para chamadas realizadas por servidores, a autorização deverá utilizar mecanismos adequados, como autenticação por token e, quando necessário, validação de IP ou identidade do cliente.

**Importante:** CORS não substitui autenticação. A URL de origem enviada em uma requisição pode ser falsificada por clientes que não sejam navegadores.

### 4.3. Proteções adicionais

Implementar:

- Rate limiting por barricada e, quando aplicável, por consumidor.
- Limite de chamadas diárias.
- Validação de parâmetros e payloads.
- Proteção contra abuso e requisições malformadas.
- Timeout e limite de tamanho das respostas.
- Restrição de destinos externos para impedir SSRF.
- Registro de eventos de segurança.
- Mensagens de erro que não revelem credenciais ou detalhes internos.

## 5. Limites de utilização e consumo

Cada barricada deverá permitir definir quantas chamadas poderá executar por dia.

O sistema deverá contabilizar as requisições recebidas e as chamadas efetivamente encaminhadas à API externa.

Deverá ser possível configurar:

- Limite diário de chamadas.
- Limite de requisições por minuto.
- Quantidade de chamadas utilizadas.
- Quantidade de chamadas restantes.
- Data e horário da última chamada.
- Política de reinicialização do contador diário.
- Ação a executar quando o limite for atingido.

Quando o limite for excedido, a barricada deverá bloquear novas chamadas e retornar uma resposta padronizada, sem consumir desnecessariamente a cota do serviço externo.

O sistema deverá distinguir chamadas recebidas, chamadas rejeitadas por segurança, tentativas de fallback e chamadas efetivamente executadas no provedor externo.

## 6. Visualização e reformulação de respostas

Uma das funcionalidades centrais será permitir visualizar a resposta original retornada pela API externa e definir como ela deverá ser entregue ao consumidor da barricada.

### 6.1. Inspeção da resposta original

O painel deverá disponibilizar uma ferramenta para testar a API cadastrada e visualizar:

- URL e método utilizados.
- Parâmetros enviados.
- Cabeçalhos relevantes.
- Corpo da requisição.
- Código HTTP retornado.
- Cabeçalhos da resposta.
- JSON ou conteúdo original retornado.
- Tempo de resposta.
- Erros ocorridos durante a execução.

Credenciais e dados sensíveis deverão ser mascarados na interface.

### 6.2. Editor de resposta personalizada

Após visualizar a resposta original, o usuário deverá poder montar um JSON personalizado para definir exatamente o que será retornado pela barricada.

O editor deverá permitir:

- Selecionar campos da resposta original.
- Renomear propriedades.
- Reorganizar a estrutura do JSON.
- Criar objetos e arrays.
- Criar propriedades fixas.
- Remover informações desnecessárias.
- Tratar campos ausentes ou nulos.
- Definir valores padrão.
- Aplicar transformações compatíveis.
- Validar a estrutura do JSON antes de salvar.
- Visualizar uma prévia da resposta final.

Exemplo de resposta original da API externa:

```json
{
  "data": {
    "user": {
      "id": "12345",
      "username": "exemplo",
      "full_name": "Usuário Exemplo",
      "followers_count": 15000,
      "email": "privado@exemplo.com"
    }
  },
  "status": "ok"
}
```

Resposta personalizada configurada na barricada:

```json
{
  "id": "{{data.user.id}}",
  "usuario": "{{data.user.username}}",
  "nome": "{{data.user.full_name}}",
  "seguidores": "{{data.user.followers_count}}"
}
```

Resposta efetivamente entregue ao consumidor:

```json
{
  "id": "12345",
  "usuario": "exemplo",
  "nome": "Usuário Exemplo",
  "seguidores": 15000
}
```

O editor deverá preservar os tipos de dados originais, evitando converter números e booleanos em strings desnecessariamente.

A transformação deverá ser executada no servidor, depois da chamada externa e antes de entregar a resposta ao consumidor.

## 7. Monitoramento e histórico de chamadas

Todas as chamadas deverão ser registradas para auditoria, análise de consumo e identificação de falhas.

Cada registro deverá conter, conforme aplicável:

- Identificador da requisição.
- Barricada utilizada.
- API externa associada.
- Data e horário.
- Método HTTP.
- Código HTTP recebido do provedor.
- Código HTTP entregue ao consumidor.
- Tempo de resposta.
- Status da execução.
- Quantidade de tentativas.
- Indicação de uso da barricada alternativa.
- Motivo de falha.
- Consumo contabilizado.
- Identificador do consumidor, quando disponível.

O painel deverá permitir pesquisar, filtrar e ordenar os registros por API, barricada, período, status e tipo de erro.

O armazenamento de logs deverá evitar tokens, chaves de API, senhas, dados pessoais desnecessários e corpos de requisição ou resposta que contenham informações sensíveis.

## 8. Status e monitoramento de disponibilidade

Cada API e barricada deverá apresentar um status operacional.

Os estados poderão incluir:

- **Ativa:** configuração habilitada.
- **Operacional:** chamadas de verificação recentes foram concluídas com sucesso.
- **Instável:** apresenta falhas ou latência elevada.
- **Com erro:** falhas persistentes ou erro de configuração.
- **Inativa:** desabilitada manualmente.
- **Limite atingido:** cota de utilização esgotada.

O sistema deverá realizar verificações de disponibilidade quando configurado e apresentar indicadores de sucesso, falha e latência.

É importante distinguir o status administrativo da configuração da disponibilidade real do serviço externo. Uma API habilitada não está necessariamente operacional.

## 9. Barricada alternativa e fallback

O sistema deverá permitir configurar uma segunda barricada como alternativa para situações em que a barricada principal não consiga atender à requisição.

Exemplo:

- Barricada principal: `instagram-perfil`.
- Barricada alternativa: `instagram-perfil-backup`.

Quando a execução principal falhar conforme as condições configuradas, o sistema deverá tentar utilizar a barricada alternativa.

A política de fallback deverá permitir definir quais situações justificam uma nova tentativa, como:

- Timeout.
- Erros de conexão.
- Erros HTTP 5xx.
- Indisponibilidade do provedor.

Erros de autenticação, parâmetros inválidos, limite diário excedido e outras falhas de configuração não deverão acionar automaticamente o fallback, salvo regra explicitamente configurada.

O sistema deverá impedir ciclos de fallback, chamadas recursivas e tentativas ilimitadas.

As chamadas realizadas pela barricada alternativa deverão respeitar seus próprios tokens, limites, permissões e regras de transformação.

O histórico deverá indicar quando houve fallback, qual foi o motivo e qual barricada processou a requisição.

Para operações que alteram dados, como POST e DELETE, novas tentativas só deverão ocorrer quando for seguro garantir que a operação não foi executada anteriormente ou quando houver suporte a idempotência.

## 10. Painel administrativo

Criar um dashboard central para acompanhar a utilização e a saúde da plataforma.

O painel deverá apresentar:

- Total de APIs cadastradas.
- Total de barricadas cadastradas.
- APIs operacionais e com falhas.
- Total de chamadas no dia.
- Chamadas bem-sucedidas e com erro.
- Consumo por API e por barricada.
- Barricadas próximas de atingir seus limites.
- Tempo médio de resposta.
- Taxa de sucesso.
- Histórico recente de erros.
- Quantidade de chamadas atendidas por fallback.

Também deverá existir uma área de administração para cadastrar, editar, testar, ativar, desativar e excluir APIs e barricadas.

## 11. Fluxo de execução de uma chamada

O processamento de cada requisição deverá seguir esta sequência:

1. O consumidor chama o endpoint da barricada.
2. O sistema identifica a barricada solicitada.
3. Valida o token de autenticação.
4. Valida a origem ou as demais restrições de acesso aplicáveis.
5. Valida o método HTTP, os parâmetros e o payload.
6. Verifica os limites de consumo e a disponibilidade da configuração.
7. Registra o início da execução.
8. Monta a requisição com a URL, os cabeçalhos e os parâmetros configurados.
9. Executa a chamada à API externa.
10. Registra o status HTTP, o tempo de resposta e os dados técnicos necessários para auditoria.
11. Aplica a transformação de resposta configurada.
12. Se ocorrer uma falha elegível, executa a política de fallback.
13. Retorna ao consumidor a resposta transformada ou um erro padronizado.
14. Atualiza os indicadores de consumo, sucesso, falha e disponibilidade.

As verificações de autenticação e autorização devem ocorrer antes de qualquer chamada ao serviço externo.

## 12. Requisitos de arquitetura e confiabilidade

A implementação deverá considerar:

- Execução de requisições externas exclusivamente no backend.
- Separação entre cadastro de APIs, barricadas, autenticação, execução, transformação e monitoramento.
- Armazenamento seguro de credenciais.
- Contabilização consistente de chamadas concorrentes.
- Tratamento padronizado de erros.
- Logs estruturados e rastreabilidade por identificador de requisição.
- Controle de timeout e concorrência.
- Prevenção de loops entre barricadas.
- Versionamento das configurações e transformações, quando necessário.
- Possibilidade de adicionar novas APIs sem alterar o código da aplicação.
- Interface responsiva e intuitiva.
- Paginação dos históricos e dos registros de consumo.

A contabilização de limites deverá ser atômica para evitar que chamadas simultâneas ultrapassem a cota configurada.

## 13. Critérios de aceitação

O sistema será considerado funcional quando permitir:

1. Cadastrar uma API externa com URL, método, cabeçalhos e parâmetros.
2. Testar a API e visualizar sua resposta original.
3. Criar uma barricada vinculada à API.
4. Gerar automaticamente um endpoint protegido.
5. Definir token exclusivo, origens autorizadas e limites de consumo.
6. Configurar e validar uma resposta JSON personalizada.
7. Consumir a barricada e receber somente a resposta transformada.
8. Consultar o histórico e identificar chamadas bem-sucedidas e com falha.
9. Acompanhar a disponibilidade e o consumo das APIs.
10. Bloquear requisições não autorizadas ou acima dos limites.
11. Configurar uma barricada alternativa com regras de fallback.
12. Identificar no histórico quando o fallback foi acionado.
13. Alterar configurações pelo painel sem precisar modificar o código-fonte da aplicação.

## Resultado esperado

Uma plataforma centralizada de gerenciamento de APIs, na qual cada serviço externo possa ser cadastrado uma única vez e disponibilizado por meio de barricadas configuráveis, com autenticação, controle de acesso, limites de consumo, transformação de respostas, monitoramento e recuperação de falhas.

O sistema deverá oferecer flexibilidade para integrar novos serviços sem desenvolvimento de rotas específicas para cada API, mantendo a segurança e a governança centralizadas no backend.
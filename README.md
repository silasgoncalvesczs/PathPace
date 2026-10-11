# PathPace

Aplicativo web para registrar corridas (ou qualquer percurso) usando o GPS do aparelho. Mostra velocidade, distância e tempo em tempo real, guarda o histórico no próprio navegador e desenha a rota percorrida em um mapa.

Não tem backend, nem etapa de build: são páginas estáticas em HTML, CSS e JavaScript.

## Funcionalidades

- **Nova corrida**: velocímetro em km/h, distância (km) e cronômetro, com a tela mantida ligada durante a gravação e um indicador de que isso está valendo.
- **Retomar corrida**: se a página for fechada ou descartada pelo sistema no meio do percurso, a corrida não se perde. O histórico mostra o aviso "Corrida em andamento" e a tela de nova corrida oferece **Retomar** ou **Salvar e encerrar**.
- **Histórico**: lista das corridas, da mais recente para a mais antiga, com miniatura do mapa, local, velocidade máxima, distância, duração e data.
- **Paginação**: o seletor "Corridas por página" (5, 10, 20 ou 50) limita quantas corridas aparecem por vez. A escolha é lembrada nas próximas visitas e a página atual fica na URL (`?pagina=2`).
- **Detalhe**: rota completa desenhada no mapa e métricas da corrida.
- **Gráfico de velocidade x tempo**: linha curva e suave com a velocidade (km/h) ao longo da corrida, linha tracejada da média e valor do ponto ao tocar (ou passar o mouse). Usa só os dados já salvos. Corridas com mais de 60 leituras são agrupadas por janelas de tempo (média de cada janela), então o gráfico ocupa sempre o mesmo espaço, com poucos ou muitos pontos. Trechos sem leitura (tela apagada, sinal fraco) aparecem como lacuna, sem linha ligando os dois lados.
- **Gráfico ligado ao mapa**: ao tocar no gráfico, um marcador azul no mapa mostra onde você estava naquele instante.
- **Rota colorida pela velocidade**: do vermelho (lento) ao verde (rápido), com legenda em km/h e um botão para voltar à linha vermelha simples. A cor usa a mesma velocidade do gráfico. Ela só aparece em percursos que não passam por cima de si mesmos: em pistas, circuitos e idas e voltas as voltas se sobrepõem no mapa e a cor não se lê, então a rota fica vermelha e o botão não aparece.
- **Parciais**: tabela com distância, tempo, ritmo (min/km) e velocidade média a cada km, destacando o trecho mais rápido e o mais lento. Em pistas e circuitos, o app detecta as voltas (passagens de volta ao ponto de partida, com pelo menos 2 voltas completas) e oferece também a tabela **por volta**. O trecho final incompleto aparece em itálico e fica fora da comparação.
- **Aviso de armazenamento**: uma faixa discreta aparece no histórico e no velocímetro quando o `localStorage` passa de 80% do espaço estimado e, durante a gravação, se um ponto não puder ser salvo.
- **Exclusão** de corridas, com confirmação.
- **Filtro de GPS impreciso**: leituras com precisão pior que 30 m são descartadas, para o ruído não inflar a distância.
- **Tema claro/escuro**: botão no cabeçalho. A escolha fica salva; quem ainda não escolheu segue o tema do sistema. No escuro, as ruas do mapa são invertidas para um fundo escuro.
- **PWA**: pode ser instalado na tela inicial e abre sem internet (veja [Instalar como aplicativo](#instalar-como-aplicativo-pwa)).

## Como executar

O navegador só libera a geolocalização em contexto seguro (`https` ou `localhost`). Abrir o `index.html` direto do disco (`file://`) não grava corridas.

Na pasta do projeto, suba qualquer servidor estático. Por exemplo:

```bash
python3 -m http.server 8000
```

Depois abra `http://localhost:8000` e permita o acesso à localização quando o navegador pedir.

### Testar no celular

Abrir o servidor pelo IP da rede (por exemplo `http://192.168.1.13:5500`) **não libera o GPS**: o navegador trata esse endereço como inseguro e nega a localização sem perguntar. O app avisa isso ao tocar em **Iniciar**. Alternativas:

- **GitHub Pages** (ou outro endereço `https`): é o caminho mais simples e é como o app será usado de verdade.
- **Túnel `https`** para a sua máquina, por exemplo `npx localtunnel --port 5500` ou `cloudflared tunnel --url http://localhost:5500`.
- **Chrome no Android, só para desenvolvimento**: abra `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, ative a opção, informe `http://192.168.1.13:5500` (o seu IP e porta) e reinicie o navegador.

## Instalar como aplicativo (PWA)

O PathPace é um Progressive Web App. Publicado em `https` (como no GitHub Pages), ele pode ser instalado e usado sem abrir o navegador:

- **Android (Chrome):** use o botão de download no cabeçalho do histórico, ou o menu do navegador, em **Instalar aplicativo**.
- **iPhone (Safari):** toque em **Compartilhar** e depois em **Adicionar à Tela de Início**. O Safari não mostra o botão de instalar do app.
- **Computador (Chrome/Edge):** ícone de instalação na barra de endereço.

Instalado, o app tem ícone próprio, abre em tela cheia e tem o atalho **Nova corrida** ao segurar o ícone (Android).

### O que funciona sem internet

Depois da primeira visita online, o app abre sem rede: telas, estilos, ícones e as corridas salvas (que ficam no `localStorage`). Também funcionam offline:

- a **gravação de uma corrida**, porque o GPS não depende de internet;
- os **mapas** das áreas já vistas (até 200 tiles ficam guardados; o resto aparece em branco até haver conexão);
- o **nome da cidade** de corridas já abertas online. Para uma corrida nova gravada offline, aparece "Local desconhecido" até a próxima consulta com internet.

### Atualizações

O app busca a versão mais nova a cada abertura com internet e usa a cópia guardada quando está sem rede ou com sinal fraco (espera até 4 s). Ao publicar uma mudança nos arquivos, aumente a constante `VERSAO` em `service-worker.js`: isso limpa os caches antigos nos aparelhos dos usuários.

### Tela apagada e segundo plano

Um site ou PWA **não consegue receber o GPS com a tela desligada** nem com o app em segundo plano: o navegador pausa a localização nesses casos, e não existe API web para evitar isso. Por isso o PathPace trabalha para a tela não apagar e se recupera quando ela apaga mesmo assim:

- **Tela ligada:** durante a corrida o app usa a Screen Wake Lock API e mostra o indicador **Tela mantida ligada**. Se o sistema soltar o bloqueio (por exemplo, no modo de economia de bateria), o indicador fica amarelo e o app tenta de novo a cada 15 s e ao voltar para o app.
- **Cronômetro sempre certo:** o tempo é calculado pelo horário de início, não por um contador somado a cada segundo. Com a tela apagada ele não para: ao voltar, mostra o tempo real decorrido.
- **Ao voltar para o app:** o GPS é reiniciado e, se o app passou mais de 15 s em segundo plano, aparece um aviso. O trecho sem leitura é ligado em linha reta, então a distância desse intervalo é aproximada.

Para o percurso completo ser gravado, mantenha o app aberto e a tela ligada: em bike, deixe o celular no suporte; em corrida a pé, o bloqueio automático não deve apagar a tela. Se quiser um modo para economizar bateria sem apagar a tela, ou gravação real em segundo plano, o caminho seria um app nativo (por exemplo com Capacitor), que pode usar o serviço de localização do sistema.

### Arquivos do PWA

| Arquivo | Função |
|---|---|
| `manifest.webmanifest` | Nome, cores, ícones e atalho do app instalado |
| `service-worker.js` | Cache para uso offline |
| `pwa.js` | Registra o service worker e controla o botão de instalar |
| `assets/icones/` | Ícones 192 e 512 px, versão *maskable* (Android) e ícone do iPhone |

Os caminhos são todos relativos (`./`), então o app funciona em um subcaminho como `usuario.github.io/PathPace/`.

## Estrutura

| Arquivo | Função |
|---|---|
| `index.html` / `index.js` | Histórico de corridas com paginação |
| `velocimetro.html` / `velocimetro.js` | Gravação de uma nova corrida |
| `detalhe.html` / `detalhe.js` | Rota, métricas e exclusão de uma corrida |
| `armazenamento.js` | Leitura e gravação no `localStorage` |
| `calculos.js` | Distância, velocidade, duração, gráfico, parciais, voltas e cores da rota |
| `local.js` | Nome da cidade (geocodificação) e o cache desse nome na corrida |
| `interface.js` | Funções de tela compartilhadas (bloco de dados, mapa, gráfico de velocidade) |
| `tema.js` | Tema claro/escuro e o botão de alternância |
| `estilos.css` | Estilos próprios, por cima do Bootstrap |
| `manifest.webmanifest`, `service-worker.js`, `pwa.js` | PWA (veja a seção acima) |
| `assets/` | Logo e ícones do app |

## Dados no `localStorage`

Tudo fica no navegador do usuário, no `localStorage`. Nada é enviado a servidor próprio.

| Chave | Conteúdo |
|---|---|
| `pathpace:corrida:<id>` | Uma corrida em JSON (o `<id>` é o horário de início, em milissegundos) |
| `pathpace:porPagina` | Preferência de corridas por página |
| `pathpace:tema` | `claro` ou `escuro`. Ausente: segue o tema do sistema |
| `pathpace:corridaAtiva` | Id da corrida que está sendo gravada. Some ao parar ou encerrar |

Formato de uma corrida:

```json
{
  "versao": 1,
  "id": "1730000000000",
  "inicio": 1730000000000,
  "fim": 1730000600000,
  "local": "São Paulo, São Paulo - BR",
  "posicoes": [
    {
      "latitude": -23.55,
      "longitude": -46.63,
      "velocidade": 3.2,
      "precisao": 8,
      "altitude": 760,
      "precisaoAltitude": 10,
      "rumo": 90,
      "timestamp": 1730000001000
    }
  ]
}
```

- `versao` é a versão do formato (hoje 1). Serve para importar o histórico para outro armazenamento, como um servidor, sem adivinhar o formato. Corridas antigas ganham o campo na próxima vez que forem salvas.
- `velocidade` é em m/s, como o GPS informa. A interface converte para km/h.
- `fim` fica `null` se a aba foi fechada sem tocar em **Parar**. Nesse caso a duração usa o horário da última posição gravada.
- `local` é um cache da geocodificação: o nome da cidade é pedido à API uma única vez por corrida.

### Migração de dados antigos

Versões anteriores gravavam cada corrida em uma chave numérica pura, com campos em inglês (`data`, `startTime`, `stopTime`). Ao abrir o app, essas corridas são convertidas automaticamente para o formato atual, sem perda de dados.

## Tecnologias

- [Bootstrap 5](https://getbootstrap.com/) e Bootstrap Icons, para a interface
- [Leaflet](https://leafletjs.com/) com tiles do [OpenStreetMap](https://www.openstreetmap.org/), para os mapas
- [BigDataCloud](https://www.bigdatacloud.com/) (geocodificação reversa gratuita), para descobrir a cidade da corrida
- Geolocation API e Screen Wake Lock API do navegador

Bootstrap, Leaflet e as fontes vêm de CDN, então é preciso estar online para carregar o app, os mapas e o nome das cidades.

## Limitações conhecidas

- Os dados ficam só neste navegador e neste aparelho. Limpar os dados do site apaga o histórico.
- O `localStorage` tem limite de cerca de 5 MB. O app avisa quando passa de 80% (uma estimativa: o limite real varia entre navegadores) e quando um ponto deixa de ser salvo. A solução é excluir corridas antigas.
- Não há pausa, exportação nem gravação com a tela bloqueada: a tela é mantida ligada durante a corrida.
- Se a corrida for encerrada sem nenhuma leitura de GPS válida, ela é descartada.
- No iPhone, o app instalado na tela inicial tem armazenamento separado do Safari: corridas gravadas no Safari não aparecem no app instalado, e vice-versa. No Android, o Chrome e o app instalado compartilham os dados.
- O app só grava a rota enquanto está aberto e com a tela ligada: não há gravação em segundo plano, nem instalado (veja [Tela apagada e segundo plano](#tela-apagada-e-segundo-plano)).

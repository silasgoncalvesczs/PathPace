// Tela de nova corrida: grava a posição do GPS e mostra velocidade, distância e tempo.
//
// Sobre tela apagada: uma página web não consegue receber o GPS com a tela desligada
// ou com o app em segundo plano. O que o app faz:
//  - mantém a tela ligada durante a corrida (Screen Wake Lock) e mostra se isso está valendo;
//  - calcula o tempo pelo horário de início, então ele continua correto mesmo com a tela apagada;
//  - ao voltar para o app, reinicia o GPS e avisa que houve um trecho sem gravação;
//  - guarda qual corrida está ativa, para poder retomá-la se a página for fechada.

// Leituras com precisão pior que isso (em metros) são descartadas,
// para o ruído do GPS não inflar a distância percorrida.
const PRECISAO_MAXIMA_METROS = 30

// Ficar em segundo plano por mais que isso gera um aviso ao voltar.
const SEGUNDO_PLANO_AVISO_MS = 15000

// Com a tela livre para apagar, tenta pedir o bloqueio de novo a cada N segundos.
const RETENTAR_BLOQUEIO_A_CADA_S = 15

const velocidadeElemento = document.querySelector("#velocidade")
const distanciaElemento = document.querySelector("#distancia")
const duracaoElemento = document.querySelector("#duracao")
const statusElemento = document.querySelector("#status")
const bloqueioElemento = document.querySelector("#bloqueioStatus")
const avisoArmazenamento = document.querySelector("#avisoArmazenamento")
const botaoIniciar = document.querySelector("#btnIniciar")
const botaoParar = document.querySelector("#btnParar")
const botaoRetomar = document.querySelector("#btnRetomar")
const botaoEncerrarPendente = document.querySelector("#btnEncerrarPendente")

let idMonitoramento = null
let corridaAtual = null
let corridaPendente = null
let intervaloDuracao = null
let bloqueioTela = null
let solicitandoBloqueio = false
let segundosSemBloqueio = 0
let emSegundoPlanoDesde = null
let statusTemporarioAte = 0

function exibirStatus(mensagem) {
    // Um aviso temporário não é apagado pela próxima leitura de GPS.
    if (mensagem === "" && Date.now() < statusTemporarioAte) return
    statusElemento.textContent = mensagem
}

function exibirStatusTemporario(mensagem, duracaoMs) {
    statusTemporarioAte = Date.now() + duracaoMs
    statusElemento.textContent = mensagem
}

function traduzirErroGps(erro) {
    switch (erro.code) {
        case erro.PERMISSION_DENIED:
            return "Permissão de localização negada. Libere o acesso à localização nas configurações do navegador."
        case erro.POSITION_UNAVAILABLE:
            return "Localização indisponível. Verifique se o GPS está ligado."
        case erro.TIMEOUT:
            return "Tempo esgotado ao obter a localização. Tentando novamente..."
        default:
            return "Não foi possível obter a localização."
    }
}

function alternarBotoes(estado) {
    botaoIniciar.classList.toggle("d-none", estado !== "parado")
    botaoParar.classList.toggle("d-none", estado !== "gravando")
    botaoRetomar.classList.toggle("d-none", estado !== "pendente")
    botaoEncerrarPendente.classList.toggle("d-none", estado !== "pendente")
}

function bloqueioAtivo() {
    return bloqueioTela !== null && !bloqueioTela.released
}

// Indicador "Tela mantida ligada" / "A tela pode apagar".
function atualizarIndicadorTela() {
    if (idMonitoramento === null) {
        bloqueioElemento.hidden = true
        return
    }

    bloqueioElemento.hidden = false

    if (bloqueioAtivo()) {
        bloqueioElemento.dataset.estado = "ligada"
        bloqueioElemento.textContent = "Tela mantida ligada"
    } else if (!("wakeLock" in navigator)) {
        bloqueioElemento.dataset.estado = "desligada"
        bloqueioElemento.textContent = "Este navegador não mantém a tela ligada: ela pode apagar"
    } else {
        bloqueioElemento.dataset.estado = "desligada"
        bloqueioElemento.textContent = "A tela pode apagar (modo de economia de bateria ativo?)"
    }
}

// Mantém a tela ligada durante a corrida (Screen Wake Lock API).
// O navegador solta o bloqueio sozinho quando a tela apaga ou o app vai para segundo plano,
// por isso ele é pedido de novo ao voltar e a cada poucos segundos se estiver faltando.
async function solicitarBloqueioDeTela() {
    if (!("wakeLock" in navigator)) {
        atualizarIndicadorTela()
        return
    }

    if (bloqueioAtivo() || solicitandoBloqueio || document.visibilityState !== "visible")
        return

    solicitandoBloqueio = true
    try {
        const bloqueio = await navigator.wakeLock.request("screen")
        bloqueio.addEventListener("release", atualizarIndicadorTela)
        bloqueioTela = bloqueio
    } catch (erro) {
        console.error(`${erro.name}, ${erro.message}`)
    } finally {
        solicitandoBloqueio = false
    }

    atualizarIndicadorTela()
}

async function liberarBloqueioDeTela() {
    const bloqueio = bloqueioTela
    bloqueioTela = null
    if (bloqueio && !bloqueio.released) {
        try {
            await bloqueio.release()
        } catch (erro) {
            console.error(erro)
        }
    }
}

function aoReceberPosicao(posicao) {
    if (posicao.coords.accuracy > PRECISAO_MAXIMA_METROS) {
        exibirStatus(`Sinal de GPS fraco (precisão de ${Math.round(posicao.coords.accuracy)} m). Aguardando...`)
        return
    }

    exibirStatus("")

    // Com o armazenamento cheio o aviso fica na tela até a gravação voltar a funcionar.
    if (adicionarPosicao(corridaAtual, posicao))
        atualizarAvisoArmazenamento(avisoArmazenamento, estadoInicialArmazenamento === "quase" ? "quase" : null)
    else
        atualizarAvisoArmazenamento(avisoArmazenamento, "cheio")

    const velocidade = posicao.coords.speed
    velocidadeElemento.textContent = velocidade ? velocidadeKmh(velocidade).toFixed(1) : "0"
    distanciaElemento.textContent = calcularDistancia(corridaAtual.posicoes).toFixed(2)
}

function aoFalharGps(erro) {
    exibirStatus(traduzirErroGps(erro))
}

function iniciarMonitoramento() {
    idMonitoramento = navigator.geolocation.watchPosition(
        aoReceberPosicao,
        aoFalharGps,
        { enableHighAccuracy: true }
    )
}

// Depois de ficar em segundo plano o navegador pode deixar o GPS parado; recomeçar garante as leituras.
function reiniciarMonitoramento() {
    if (idMonitoramento === null) return

    navigator.geolocation.clearWatch(idMonitoramento)
    iniciarMonitoramento()
}

// O tempo vem sempre do horário de início, não de um contador somado a cada segundo.
// Assim o cronômetro continua certo mesmo se o navegador pausar os temporizadores.
function atualizarDuracao() {
    const duracao = calcularDuracaoMs({ inicio: corridaAtual.inicio, fim: Date.now(), posicoes: [] })
    duracaoElemento.textContent = formatarDuracao(duracao)

    if (bloqueioAtivo() || document.visibilityState !== "visible") {
        segundosSemBloqueio = 0
        return
    }

    segundosSemBloqueio++
    if (segundosSemBloqueio >= RETENTAR_BLOQUEIO_A_CADA_S) {
        segundosSemBloqueio = 0
        solicitarBloqueioDeTela()
    }
}

function ambienteSuportaGps() {
    if (!("geolocation" in navigator)) {
        exibirStatus("Este navegador não suporta geolocalização.")
        return false
    }

    // Em http (fora de localhost) o navegador bloqueia o GPS sem nem perguntar.
    if (!window.isSecureContext) {
        exibirStatus(
            "O GPS só funciona em páginas seguras (https ou localhost). " +
            "Acesse o PathPace por um endereço https, como o do GitHub Pages."
        )
        return false
    }

    return true
}

// Começa (ou retoma) a gravação de uma corrida já criada.
function comecarGravacao(corrida) {
    corridaAtual = corrida
    emSegundoPlanoDesde = null

    distanciaElemento.textContent = calcularDistancia(corrida.posicoes).toFixed(2)
    velocidadeElemento.textContent = "0"

    exibirStatus("Aguardando sinal de GPS...")
    iniciarMonitoramento()

    atualizarDuracao()
    intervaloDuracao = setInterval(atualizarDuracao, 1000)

    alternarBotoes("gravando")
    atualizarIndicadorTela()
    solicitarBloqueioDeTela()
}

// Há uma corrida que não foi finalizada (página fechada ou descartada pelo sistema)?
function verificarCorridaPendente() {
    const pendente = obterCorridaAtiva()
    if (!pendente) return

    corridaPendente = pendente

    const ultima = pendente.posicoes[pendente.posicoes.length - 1]
    const ultimaLeitura = ultima && ultima.timestamp ? ultima.timestamp : pendente.inicio

    distanciaElemento.textContent = calcularDistancia(pendente.posicoes).toFixed(2)
    duracaoElemento.textContent = formatarDuracao(calcularDuracaoMs(pendente))

    exibirStatus(
        `Corrida em andamento de ${formatarDataInicio(pendente.inicio)}. ` +
        `Última leitura de GPS há ${formatarDuracao(Date.now() - ultimaLeitura)}.`
    )
    alternarBotoes("pendente")
}

function irParaHistorico() {
    window.location.href = "./index.html"
}

botaoIniciar.addEventListener("click", () => {
    if (idMonitoramento !== null) return
    if (!ambienteSuportaGps()) return

    comecarGravacao(criarNovaCorrida())
})

botaoRetomar.addEventListener("click", () => {
    if (idMonitoramento !== null || !corridaPendente) return
    if (!ambienteSuportaGps()) return

    const corrida = corridaPendente
    corridaPendente = null
    comecarGravacao(corrida)
})

botaoEncerrarPendente.addEventListener("click", () => {
    if (!corridaPendente) return

    const ultima = corridaPendente.posicoes[corridaPendente.posicoes.length - 1]

    // Sem nenhum ponto de GPS não há o que mostrar; com pontos, encerra no horário do último.
    if (!ultima)
        excluirCorrida(corridaPendente.id)
    else
        finalizarCorrida(corridaPendente, ultima.timestamp || Date.now())

    corridaPendente = null
    irParaHistorico()
})

botaoParar.addEventListener("click", () => {
    if (idMonitoramento === null) return

    clearInterval(intervaloDuracao)
    navigator.geolocation.clearWatch(idMonitoramento)
    idMonitoramento = null
    liberarBloqueioDeTela()

    // Corrida sem nenhum ponto de GPS não tem o que mostrar: é descartada.
    if (corridaAtual.posicoes.length === 0)
        excluirCorrida(corridaAtual.id)
    else
        finalizarCorrida(corridaAtual)

    corridaAtual = null

    irParaHistorico()
})

document.addEventListener("visibilitychange", () => {
    if (idMonitoramento === null) return

    if (document.visibilityState === "hidden") {
        emSegundoPlanoDesde = Date.now()
        return
    }

    // Voltou para o app: atualiza o tempo na hora, pede a tela ligada e recomeça o GPS.
    const tempoFora = emSegundoPlanoDesde ? Date.now() - emSegundoPlanoDesde : 0
    emSegundoPlanoDesde = null

    atualizarDuracao()
    atualizarIndicadorTela()
    solicitarBloqueioDeTela()
    reiniciarMonitoramento()

    if (tempoFora >= SEGUNDO_PLANO_AVISO_MS) {
        exibirStatusTemporario(
            `O app ficou em segundo plano por ${formatarDuracao(tempoFora)} (tela apagada ou outro app). ` +
            "O GPS pausa nesse período e o trecho foi ligado em linha reta. O tempo continua correto.",
            15000
        )
    }
})

// Medido uma vez ao abrir a tela: ler todo o localStorage a cada leitura de GPS seria pesado.
const estadoInicialArmazenamento = obterEstadoArmazenamento()
atualizarAvisoArmazenamento(avisoArmazenamento, estadoInicialArmazenamento)

verificarCorridaPendente()

// Camada de persistência: todas as corridas ficam no localStorage do navegador.
//
// Formato de uma corrida (chave "pathpace:corrida:<id>"):
// {
//   versao: 1,               // versão do formato (facilita importar o histórico para um servidor)
//   id: "1730000000000",
//   inicio: 1730000000000,   // timestamp (ms) do início
//   fim: 1730000600000,      // timestamp (ms) do fim, ou null se não foi finalizada
//   local: "Cidade, UF - BR",// cache da geocodificação reversa (opcional)
//   posicoes: [{ latitude, longitude, velocidade, precisao, altitude,
//                precisaoAltitude, rumo, timestamp }]
// }

const PREFIXO_CORRIDA = "pathpace:corrida:"
const CHAVE_POR_PAGINA = "pathpace:porPagina"
// Id da corrida que está sendo gravada. Permite retomá-la se a página for fechada
// ou descartada pelo sistema no meio do percurso.
const CHAVE_CORRIDA_ATIVA = "pathpace:corridaAtiva"
const OPCOES_POR_PAGINA = [5, 10, 20, 50]
const POR_PAGINA_PADRAO = 10

// Versão do formato das corridas. Aumente quando o formato mudar.
const VERSAO_FORMATO = 1

// O navegador reserva cerca de 5 milhões de caracteres por site no localStorage.
// É uma estimativa: o limite real varia entre navegadores.
const LIMITE_ESTIMADO_ARMAZENAMENTO = 5 * 1024 * 1024
const FRACAO_AVISO_ARMAZENAMENTO = 0.8

// Se um salvamento falhar, o localStorage está cheio e não dá para registrar isso nele.
// O sessionStorage tem cota própria e guarda o aviso enquanto a aba estiver aberta.
const CHAVE_FALHA_ARMAZENAMENTO = "pathpace:falhaArmazenamento"

function chaveDaCorrida(id) {
    return PREFIXO_CORRIDA + id
}

function registrarFalhaDeArmazenamento(falhou) {
    try {
        if (falhou)
            sessionStorage.setItem(CHAVE_FALHA_ARMAZENAMENTO, "1")
        else
            sessionStorage.removeItem(CHAVE_FALHA_ARMAZENAMENTO)
    } catch (erro) {
        console.error("Não foi possível registrar o estado do armazenamento:", erro)
    }
}

// Fração (0 a 1 ou mais) do espaço estimado que já está em uso.
function calcularUsoArmazenamento() {
    let caracteres = 0

    try {
        Object.keys(localStorage).forEach(chave => {
            caracteres += chave.length + (localStorage.getItem(chave) || "").length
        })
    } catch (erro) {
        console.error("Não foi possível medir o armazenamento:", erro)
    }

    return caracteres / LIMITE_ESTIMADO_ARMAZENAMENTO
}

// "cheio": um salvamento falhou; "quase": passou de 80% do espaço estimado; null: tudo certo.
// Lê todo o localStorage, então não deve ser chamada a cada leitura de GPS.
function obterEstadoArmazenamento() {
    try {
        if (sessionStorage.getItem(CHAVE_FALHA_ARMAZENAMENTO)) return "cheio"
    } catch (erro) {
        console.error(erro)
    }

    return calcularUsoArmazenamento() >= FRACAO_AVISO_ARMAZENAMENTO ? "quase" : null
}

// Converte as corridas gravadas pela versão antiga (chave numérica pura e
// campos em inglês) para o formato atual, sem perder nenhum dado.
function migrarDadosAntigos() {
    Object.keys(localStorage)
        .filter(chave => /^\d+$/.test(chave))
        .forEach(chave => {
            try {
                const antiga = JSON.parse(localStorage.getItem(chave))
                if (!antiga || !Array.isArray(antiga.data)) return

                const corrida = {
                    versao: VERSAO_FORMATO,
                    id: chave,
                    inicio: antiga.startTime,
                    fim: antiga.stopTime,
                    posicoes: antiga.data.map(p => ({
                        latitude: p.latitude,
                        longitude: p.longitude,
                        velocidade: p.speed,
                        precisao: p.accuracy,
                        altitude: p.altitude,
                        precisaoAltitude: p.altitudeAccuracy,
                        rumo: p.heading,
                        timestamp: p.timestamp
                    }))
                }

                localStorage.setItem(chaveDaCorrida(chave), JSON.stringify(corrida))
                localStorage.removeItem(chave)
            } catch (erro) {
                console.error(`Não foi possível migrar a corrida ${chave}:`, erro)
            }
        })
}

function criarNovaCorrida() {
    const inicio = Date.now()
    const corrida = {
        versao: VERSAO_FORMATO,
        id: String(inicio),
        inicio: inicio,
        fim: null,
        posicoes: []
    }
    salvarCorrida(corrida)
    definirCorridaAtiva(corrida.id)
    return corrida
}

function definirCorridaAtiva(id) {
    try {
        localStorage.setItem(CHAVE_CORRIDA_ATIVA, String(id))
    } catch (erro) {
        console.error("Não foi possível marcar a corrida ativa:", erro)
    }
}

function limparCorridaAtiva() {
    localStorage.removeItem(CHAVE_CORRIDA_ATIVA)
}

// Corrida iniciada e ainda não finalizada, ou null. Limpa a marca se ela estiver velha.
function obterCorridaAtiva() {
    const id = localStorage.getItem(CHAVE_CORRIDA_ATIVA)
    if (!id) return null

    const corrida = obterCorrida(id)
    if (!corrida || corrida.fim != null) {
        limparCorridaAtiva()
        return null
    }
    return corrida
}

// Retorna true se salvou; false se o armazenamento estiver cheio ou indisponível.
function salvarCorrida(corrida) {
    if (!corrida.versao) corrida.versao = VERSAO_FORMATO

    try {
        localStorage.setItem(chaveDaCorrida(corrida.id), JSON.stringify(corrida))
        registrarFalhaDeArmazenamento(false)
        return true
    } catch (erro) {
        console.error("Não foi possível salvar a corrida:", erro)
        registrarFalhaDeArmazenamento(true)
        return false
    }
}

function obterCorrida(id) {
    try {
        const texto = localStorage.getItem(chaveDaCorrida(id))
        if (!texto) return null
        const corrida = JSON.parse(texto)
        if (!corrida || !Array.isArray(corrida.posicoes)) return null
        corrida.id = String(id)
        return corrida
    } catch (erro) {
        console.error(`Corrida ${id} inválida:`, erro)
        return null
    }
}

// Todas as corridas, da mais recente para a mais antiga.
function obterTodasCorridas() {
    return Object.keys(localStorage)
        .filter(chave => chave.startsWith(PREFIXO_CORRIDA))
        .map(chave => obterCorrida(chave.slice(PREFIXO_CORRIDA.length)))
        .filter(corrida => corrida !== null)
        .sort((a, b) => b.inicio - a.inicio)
}

function excluirCorrida(id) {
    localStorage.removeItem(chaveDaCorrida(id))
    // Liberou espaço: o aviso de armazenamento cheio deixa de valer.
    registrarFalhaDeArmazenamento(false)
    if (localStorage.getItem(CHAVE_CORRIDA_ATIVA) === String(id))
        limparCorridaAtiva()
}

// Adiciona uma leitura do GPS (objeto GeolocationPosition) à corrida.
// Retorna o resultado de salvarCorrida.
function adicionarPosicao(corrida, posicaoGps) {
    const c = posicaoGps.coords
    corrida.posicoes.push({
        latitude: c.latitude,
        longitude: c.longitude,
        velocidade: c.speed,
        precisao: c.accuracy,
        altitude: c.altitude,
        precisaoAltitude: c.altitudeAccuracy,
        rumo: c.heading,
        timestamp: posicaoGps.timestamp
    })
    return salvarCorrida(corrida)
}

// Encerra a corrida. O fim padrão é agora; uma corrida interrompida pode ser
// encerrada no horário do último ponto gravado.
function finalizarCorrida(corrida, fim = Date.now()) {
    corrida.fim = fim
    const salvou = salvarCorrida(corrida)
    limparCorridaAtiva()
    return salvou
}

// Preferência de quantas corridas mostrar por página no histórico.
function obterPorPagina() {
    const valor = parseInt(localStorage.getItem(CHAVE_POR_PAGINA), 10)
    return OPCOES_POR_PAGINA.includes(valor) ? valor : POR_PAGINA_PADRAO
}

function salvarPorPagina(valor) {
    try {
        localStorage.setItem(CHAVE_POR_PAGINA, String(valor))
    } catch (erro) {
        console.error("Não foi possível salvar a preferência:", erro)
    }
}

migrarDadosAntigos()

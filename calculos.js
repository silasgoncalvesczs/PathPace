// Cálculos e formatações sobre os dados de uma corrida.

const RAIO_TERRA_KM = 6371
const MS_PARA_KMH = 3.6

function velocidadeKmh(metrosPorSegundo) {
    return metrosPorSegundo * MS_PARA_KMH
}

// Velocidade (km/h) pela distância entre duas leituras, quando o GPS não informou.
function velocidadeEstimadaKmh(anterior, atual) {
    const segundos = (atual.timestamp - anterior.timestamp) / 1000
    if (segundos <= 0) return null

    const kmh = calcularDistancia([anterior, atual]) / segundos * 3600
    return isFinite(kmh) ? kmh : null
}

function paraRadianos(graus) {
    return graus * Math.PI / 180
}

// Velocidade máxima em km/h (o GPS informa em m/s).
function calcularVelocidadeMaxima(posicoes) {
    let maxima = 0

    posicoes.forEach(posicao => {
        if (posicao.velocidade != null && posicao.velocidade > maxima)
            maxima = posicao.velocidade
    })

    return velocidadeKmh(maxima)
}

// Distância total percorrida em km (fórmula de Haversine).
function calcularDistancia(posicoes) {
    let total = 0

    for (let i = 0; i < posicoes.length - 1; i++) {
        const p1 = posicoes[i]
        const p2 = posicoes[i + 1]

        const deltaLatitude = paraRadianos(p2.latitude - p1.latitude)
        const deltaLongitude = paraRadianos(p2.longitude - p1.longitude)

        const a = Math.sin(deltaLatitude / 2) * Math.sin(deltaLatitude / 2) +
            Math.sin(deltaLongitude / 2) * Math.sin(deltaLongitude / 2) *
            Math.cos(paraRadianos(p1.latitude)) *
            Math.cos(paraRadianos(p2.latitude))

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

        total += RAIO_TERRA_KM * c
    }

    return total
}

// Duração em milissegundos. Se a corrida não foi finalizada (ex.: aba fechada
// durante a gravação), usa o horário da última posição registrada.
function calcularDuracaoMs(corrida) {
    let fim = corrida.fim

    if (fim == null) {
        const ultima = corrida.posicoes[corrida.posicoes.length - 1]
        fim = ultima && ultima.timestamp ? ultima.timestamp : corrida.inicio
    }

    return Math.max(0, fim - corrida.inicio)
}

// Formata milissegundos como "mm:ss" ou "hh:mm:ss".
function formatarDuracao(milissegundos) {
    const total = Math.trunc(milissegundos / 1000)
    const horas = Math.trunc(total / 3600)
    const minutos = Math.trunc((total % 3600) / 60)
    const segundos = total % 60

    const dois = numero => String(numero).padStart(2, "0")

    if (horas > 0)
        return `${dois(horas)}:${dois(minutos)}:${dois(segundos)}`

    return `${dois(minutos)}:${dois(segundos)}`
}

function formatarDataInicio(inicio) {
    const data = new Date(inicio)

    const hora = data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    const dia = data.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" })

    return `${hora} - ${dia}`
}

// ---------------------------------------------------------------------------
// Gráfico de velocidade x tempo
// ---------------------------------------------------------------------------

// Acima desse número de leituras, os pontos são agrupados por janela de tempo.
// Assim, uma corrida com 300 leituras ocupa o gráfico como uma com poucas.
const MAX_PONTOS_GRAFICO = 60

// Intervalo mínimo (em segundos) para considerar que houve um buraco sem leituras.
const BURACO_MINIMO_S = 20

// Série { t, v }: tempo desde o início (s) e velocidade (km/h).
// Usa o trajeto, para o gráfico e a rota colorida partirem da mesma velocidade.
function calcularSerieVelocidade(corrida) {
    return calcularTrajeto(corrida)
        .filter(ponto => ponto.velocidade !== null)
        .map(ponto => ({
            t: Math.max(0, (ponto.timestamp - corrida.inicio) / 1000),
            v: ponto.velocidade
        }))
}

// Reduz a série a no máximo maxPontos, tirando a média de cada janela de tempo.
// Janelas sem leituras ficam de fora, e os buracos continuam aparecendo no gráfico.
function agruparSerie(serie, maxPontos = MAX_PONTOS_GRAFICO) {
    if (serie.length <= maxPontos) return serie

    const inicio = serie[0].t
    const janela = (serie[serie.length - 1].t - inicio) / maxPontos
    const grupos = Array.from({ length: maxPontos }, () => ({ somaT: 0, somaV: 0, n: 0 }))

    serie.forEach(ponto => {
        const indice = Math.min(maxPontos - 1, Math.floor((ponto.t - inicio) / janela))
        grupos[indice].somaT += ponto.t
        grupos[indice].somaV += ponto.v
        grupos[indice].n++
    })

    return grupos
        .filter(grupo => grupo.n > 0)
        .map(grupo => ({ t: grupo.somaT / grupo.n, v: grupo.somaV / grupo.n }))
}

// Divide a série onde há buracos (tela apagada, sinal fraco), para a linha não
// atravessar um trecho sem dados.
function dividirEmTrechos(serie) {
    if (serie.length < 2) return serie.length ? [serie] : []

    const intervalos = serie.slice(1).map((ponto, i) => ponto.t - serie[i].t).sort((a, b) => a - b)
    const mediana = intervalos[Math.floor(intervalos.length / 2)]
    const limite = Math.max(BURACO_MINIMO_S, mediana * 4)

    const trechos = [[serie[0]]]
    for (let i = 1; i < serie.length; i++) {
        if (serie[i].t - serie[i - 1].t > limite)
            trechos.push([])
        trechos[trechos.length - 1].push(serie[i])
    }

    return trechos
}

function calcularMediaSerie(serie) {
    if (serie.length === 0) return 0
    return serie.reduce((soma, ponto) => soma + ponto.v, 0) / serie.length
}

// Escala do eixo Y: passo "redondo" (1, 2, 5, 10...) e topo que cobre o valor máximo.
function escalaAgradavel(maximo, divisoes = 4) {
    const bruto = Math.max(maximo, 1) / divisoes
    const potencia = Math.pow(10, Math.floor(Math.log10(bruto)))
    const fracao = bruto / potencia
    const passo = (fracao <= 1 ? 1 : fracao <= 2 ? 2 : fracao <= 5 ? 5 : 10) * potencia
    const topo = passo * Math.max(2, Math.ceil(maximo / passo))

    return { passo, topo }
}

// Passo "redondo" de tempo (em segundos) para o eixo X, com no máximo maxMarcas marcas.
function passoDeTempo(duracaoS, maxMarcas) {
    const opcoes = [5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 14400]
    return opcoes.find(passo => duracaoS / passo <= maxMarcas) || opcoes[opcoes.length - 1]
}

// Caminho SVG de uma curva suave que passa por todos os pontos { x, y } (x crescente).
// Usa interpolação cúbica monotônica: a curva não "estoura" acima do pico nem abaixo de zero.
function caminhoCurvo(pontos) {
    const arredondar = numero => Math.round(numero * 100) / 100
    const n = pontos.length

    if (n === 0) return ""
    if (n === 1) return `M${arredondar(pontos[0].x)} ${arredondar(pontos[0].y)}`

    const h = []
    const d = []
    for (let i = 0; i < n - 1; i++) {
        h.push(pontos[i + 1].x - pontos[i].x)
        d.push((pontos[i + 1].y - pontos[i].y) / h[i])
    }

    // Inclinação em cada ponto.
    const m = new Array(n)
    m[0] = d[0]
    m[n - 1] = d[n - 2]
    for (let i = 1; i < n - 1; i++)
        m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2

    // Limita as inclinações para a curva continuar monotônica entre cada par de pontos.
    for (let i = 0; i < n - 1; i++) {
        if (d[i] === 0) {
            m[i] = 0
            m[i + 1] = 0
            continue
        }

        const a = m[i] / d[i]
        const b = m[i + 1] / d[i]
        const soma = a * a + b * b
        if (soma > 9) {
            const escala = 3 / Math.sqrt(soma)
            m[i] = escala * a * d[i]
            m[i + 1] = escala * b * d[i]
        }
    }

    let caminho = `M${arredondar(pontos[0].x)} ${arredondar(pontos[0].y)}`
    for (let i = 0; i < n - 1; i++) {
        const c1x = pontos[i].x + h[i] / 3
        const c1y = pontos[i].y + m[i] * h[i] / 3
        const c2x = pontos[i + 1].x - h[i] / 3
        const c2y = pontos[i + 1].y - m[i + 1] * h[i] / 3

        caminho += ` C${arredondar(c1x)} ${arredondar(c1y)} ${arredondar(c2x)} ${arredondar(c2y)}` +
            ` ${arredondar(pontos[i + 1].x)} ${arredondar(pontos[i + 1].y)}`
    }

    return caminho
}

// ---------------------------------------------------------------------------
// Trajeto, parciais e voltas
// ---------------------------------------------------------------------------

// Trechos menores que isso (em km) no fim da corrida não viram parcial.
const PARCIAL_MINIMO_KM = 0.05

// Detecção de voltas: a volta fecha quando o corredor passa a até RAIO_LARGADA_M do ponto
// de partida, depois de ter se afastado mais que LIMITE_SAIDA_M. Com a margem de erro do GPS
// (5 a 10 m), esses valores funcionam em pistas e circuitos de uns 150 m de volta para cima.
const RAIO_LARGADA_M = 30
const LIMITE_SAIDA_M = 60
const MINIMO_DE_VOLTAS = 2

// Lista de pontos com horário e distância acumulada (km), pronta para parciais, voltas
// e cores. Descarta leituras sem horário ou fora de ordem.
function calcularTrajeto(corrida) {
    const trajeto = []
    let acumulada = 0

    corrida.posicoes.forEach(posicao => {
        if (!posicao.timestamp) return

        const anterior = trajeto[trajeto.length - 1]
        let velocidade = posicao.velocidade != null ? velocidadeKmh(posicao.velocidade) : null

        if (anterior) {
            if (posicao.timestamp <= anterior.timestamp) return

            acumulada += calcularDistancia([anterior, posicao])
            if (velocidade === null)
                velocidade = velocidadeEstimadaKmh(anterior, posicao)
        }

        trajeto.push({
            latitude: posicao.latitude,
            longitude: posicao.longitude,
            timestamp: posicao.timestamp,
            distancia: acumulada,
            velocidade: velocidade !== null && isFinite(velocidade) ? velocidade : null
        })
    })

    return trajeto
}

// Posição estimada num instante (timestamp em ms), entre as duas leituras vizinhas.
function posicaoNoTempo(trajeto, timestamp) {
    if (trajeto.length === 0) return null

    const primeiro = trajeto[0]
    const ultimo = trajeto[trajeto.length - 1]
    if (timestamp <= primeiro.timestamp) return primeiro
    if (timestamp >= ultimo.timestamp) return ultimo

    let baixo = 0
    let alto = trajeto.length - 1
    while (alto - baixo > 1) {
        const meio = (baixo + alto) >> 1
        if (trajeto[meio].timestamp <= timestamp) baixo = meio
        else alto = meio
    }

    const a = trajeto[baixo]
    const b = trajeto[alto]
    const fracao = (timestamp - a.timestamp) / (b.timestamp - a.timestamp)

    return {
        latitude: a.latitude + (b.latitude - a.latitude) * fracao,
        longitude: a.longitude + (b.longitude - a.longitude) * fracao
    }
}

// Ritmo em "m:ss" (minutos por km). "--" quando não faz sentido (parado, > 60 min/km).
function formatarRitmo(minutosPorKm) {
    if (!isFinite(minutosPorKm) || minutosPorKm <= 0 || minutosPorKm > 60) return "--"

    const total = Math.round(minutosPorKm * 60)
    const minutos = Math.floor(total / 60)
    const segundos = total % 60

    return `${minutos}:${String(segundos).padStart(2, "0")}`
}

// Transforma pontos de corte { timestamp, distancia } em parciais. O que sobra depois do
// último corte vira um parcial incompleto (se tiver pelo menos PARCIAL_MINIMO_KM).
function montarParciais(limites, ultimoPonto) {
    const pares = []
    for (let i = 1; i < limites.length; i++)
        pares.push([limites[i - 1], limites[i], false])

    const ultimoLimite = limites[limites.length - 1]
    const resto = ultimoPonto.distancia - ultimoLimite.distancia
    if (resto >= PARCIAL_MINIMO_KM && ultimoPonto.timestamp > ultimoLimite.timestamp)
        pares.push([ultimoLimite, ultimoPonto, true])

    return pares.map(([inicio, fim, parcial], i) => {
        const distanciaKm = fim.distancia - inicio.distancia
        const duracaoMs = fim.timestamp - inicio.timestamp

        return {
            numero: i + 1,
            distanciaKm,
            duracaoMs,
            ritmo: distanciaKm > 0 ? duracaoMs / 60000 / distanciaKm : Infinity,
            velocidadeMedia: duracaoMs > 0 ? distanciaKm / (duracaoMs / 3600000) : 0,
            parcial
        }
    })
}

// Parciais a cada passoKm (padrão: 1 km). O instante exato de cada marca é calculado
// entre as duas leituras que a cercam.
function calcularParciaisPorKm(trajeto, passoKm = 1) {
    if (trajeto.length < 2) return []

    const limites = [{ timestamp: trajeto[0].timestamp, distancia: 0 }]
    let proxima = passoKm

    for (let i = 1; i < trajeto.length; i++) {
        const a = trajeto[i - 1]
        const b = trajeto[i]
        if (b.distancia <= a.distancia) continue

        while (proxima <= b.distancia + 1e-9) {
            const fracao = (proxima - a.distancia) / (b.distancia - a.distancia)
            limites.push({
                timestamp: a.timestamp + fracao * (b.timestamp - a.timestamp),
                distancia: proxima
            })
            proxima += passoKm
        }
    }

    return montarParciais(limites, trajeto[trajeto.length - 1])
}

// Parciais por volta, para corridas em pista ou circuito. Retorna [] se o percurso não
// tiver pelo menos MINIMO_DE_VOLTAS voltas completas (ex.: uma ida e volta comum).
function detectarVoltas(trajeto) {
    if (trajeto.length < 3) return []

    const largada = trajeto[0]
    const raioKm = RAIO_LARGADA_M / 1000
    const saidaKm = LIMITE_SAIDA_M / 1000

    const limites = [{ timestamp: largada.timestamp, distancia: 0 }]
    let saiu = false
    let melhor = null

    // Dentro do raio, vale a leitura mais próxima da largada, não a primeira que entrou.
    const fecharVolta = () => {
        if (!melhor) return
        limites.push({ timestamp: melhor.ponto.timestamp, distancia: melhor.ponto.distancia })
        melhor = null
        saiu = false
    }

    trajeto.forEach(ponto => {
        const d = calcularDistancia([largada, ponto])

        if (!saiu) {
            if (d > saidaKm) saiu = true
            return
        }

        if (d <= raioKm) {
            if (!melhor || d < melhor.d) melhor = { d, ponto }
        } else if (melhor) {
            fecharVolta()
        }
    })
    fecharVolta()

    if (limites.length - 1 < MINIMO_DE_VOLTAS) return []

    return montarParciais(limites, trajeto[trajeto.length - 1])
}

// ---------------------------------------------------------------------------
// Rota colorida pela velocidade
// ---------------------------------------------------------------------------

// Pontos a até RAIO_SOBREPOSICAO_M de outro ponto, visitado pelo menos SEPARACAO_MINIMA_KM
// de percurso antes ou depois, são "revisitas". Acima de FRACAO_CIRCUITO de revisitas,
// a rota passa sobre si mesma (pista, ida e volta) e a cor por velocidade não se lê bem.
const RAIO_SOBREPOSICAO_M = 15
const SEPARACAO_MINIMA_KM = 0.15
const FRACAO_CIRCUITO = 0.15

// Fração (0 a 1) dos pontos que são revisitas. Usa uma grade de células para não
// comparar todos os pontos entre si.
function calcularSobreposicao(trajeto) {
    if (trajeto.length < 10) return 0

    const metrosPorGrauLatitude = 110540
    const metrosPorGrauLongitude = 111320 * Math.cos(paraRadianos(trajeto[0].latitude))
    const celula = RAIO_SOBREPOSICAO_M

    const pontos = trajeto.map(ponto => {
        const x = ponto.longitude * metrosPorGrauLongitude
        const y = ponto.latitude * metrosPorGrauLatitude
        return { x, y, d: ponto.distancia, cx: Math.floor(x / celula), cy: Math.floor(y / celula) }
    })

    const grade = new Map()
    pontos.forEach((ponto, i) => {
        const chave = `${ponto.cx},${ponto.cy}`
        if (!grade.has(chave)) grade.set(chave, [])
        grade.get(chave).push(i)
    })

    const raioQuadrado = RAIO_SOBREPOSICAO_M * RAIO_SOBREPOSICAO_M

    function ehRevisita(ponto) {
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const vizinhos = grade.get(`${ponto.cx + dx},${ponto.cy + dy}`)
                if (!vizinhos) continue

                for (const j of vizinhos) {
                    const outro = pontos[j]
                    if (Math.abs(outro.d - ponto.d) < SEPARACAO_MINIMA_KM) continue

                    const ex = outro.x - ponto.x
                    const ey = outro.y - ponto.y
                    if (ex * ex + ey * ey <= raioQuadrado) return true
                }
            }
        }
        return false
    }

    return pontos.filter(ehRevisita).length / pontos.length
}

function rotaEhCircuito(trajeto) {
    return calcularSobreposicao(trajeto) > FRACAO_CIRCUITO
}

// Cores da rota: lento, médio, rápido.
const CORES_VELOCIDADE = ["#e11d48", "#f59e0b", "#14b8a6"]

// Divide a rota em no máximo maxTrechos pedaços seguidos e calcula a velocidade média
// (km/h) de cada um. Poucos trechos mantêm o mapa leve em corridas longas.
// A velocidade é a mesma do gráfico (a informada pelo GPS); só na falta dela usa distância / tempo.
function calcularTrechosPorVelocidade(trajeto, maxTrechos = 120) {
    const passos = trajeto.length - 1
    if (passos < 1) return []

    const tamanho = Math.ceil(passos / maxTrechos)
    const trechos = []

    for (let inicio = 0; inicio < passos; inicio += tamanho) {
        const fim = Math.min(passos, inicio + tamanho)
        const a = trajeto[inicio]
        const b = trajeto[fim]
        const horas = (b.timestamp - a.timestamp) / 3600000
        const pontos = trajeto.slice(inicio, fim + 1)
        const medidas = pontos.map(p => p.velocidade).filter(v => v !== null)

        trechos.push({
            pontos: pontos.map(p => [p.latitude, p.longitude]),
            velocidade: medidas.length > 0
                ? medidas.reduce((soma, v) => soma + v, 0) / medidas.length
                : (horas > 0 ? (b.distancia - a.distancia) / horas : 0)
        })
    }

    return trechos
}

// Faixa de velocidades que vai do vermelho ao verde. Usa os percentis 5 e 95 para
// um pico isolado de GPS não "achatar" o resto das cores.
function calcularEscalaDeCores(trechos) {
    const velocidades = trechos.map(trecho => trecho.velocidade).sort((a, b) => a - b)
    const ultimo = velocidades.length - 1

    let minimo = velocidades[Math.floor(ultimo * 0.05)]
    let maximo = velocidades[Math.ceil(ultimo * 0.95)]

    // Velocidade quase constante: abre uma faixa mínima para a cor não oscilar à toa.
    if (maximo - minimo < 1) {
        const meio = (minimo + maximo) / 2
        minimo = meio - 0.5
        maximo = meio + 0.5
    }

    return { minimo, maximo }
}

function misturarCores(corA, corB, fracao) {
    const canais = cor => [1, 3, 5].map(i => parseInt(cor.slice(i, i + 2), 16))
    const a = canais(corA)
    const b = canais(corB)

    return "#" + a.map((valor, i) =>
        Math.round(valor + (b[i] - valor) * fracao).toString(16).padStart(2, "0")
    ).join("")
}

function corDaVelocidade(velocidade, escala) {
    const fracao = Math.min(1, Math.max(0, (velocidade - escala.minimo) / (escala.maximo - escala.minimo)))
    const [lento, medio, rapido] = CORES_VELOCIDADE

    return fracao < 0.5
        ? misturarCores(lento, medio, fracao * 2)
        : misturarCores(medio, rapido, (fracao - 0.5) * 2)
}


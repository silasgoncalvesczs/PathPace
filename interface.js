// Funções de interface compartilhadas entre o histórico e o detalhe da corrida.

function criarElemento(tag, classe, texto) {
    const elemento = document.createElement(tag)
    if (classe) elemento.className = classe
    if (texto !== undefined) elemento.textContent = texto
    return elemento
}

function criarMetrica(valor, rotulo) {
    const metrica = criarElemento("div", "metrica")
    metrica.append(criarElemento("strong", "", valor), criarElemento("span", "", rotulo))
    return metrica
}

// Monta o bloco de informações. O local é preenchido depois, para não atrasar a tela.
// Com detalhe=true, as métricas viram cartões maiores.
function criarBlocoDeDados(corrida, detalhe = false) {
    const bloco = criarElemento("div", "flex-fill d-flex flex-column")

    const local = criarElemento(
        "div",
        detalhe ? "local-corrida local-corrida-grande" : "local-corrida",
        "Carregando local..."
    )
    obterLocalDaCorrida(corrida).then(texto => {
        local.textContent = texto
    })

    const metricas = criarElemento("div", detalhe ? "metricas metricas-grandes" : "metricas")
    metricas.append(
        criarMetrica(calcularVelocidadeMaxima(corrida.posicoes).toFixed(1), "km/h máx."),
        criarMetrica(calcularDistancia(corrida.posicoes).toFixed(2), "km"),
        criarMetrica(formatarDuracao(calcularDuracaoMs(corrida)), "tempo")
    )

    const data = criarElemento("div", "data-corrida", formatarDataInicio(corrida.inicio))

    bloco.append(local, metricas, data)
    return bloco
}

const MENSAGENS_ARMAZENAMENTO = {
    quase: "Armazenamento do navegador quase cheio. Exclua corridas antigas para não perder novos registros.",
    cheio: "Armazenamento do navegador cheio: novos pontos não estão sendo salvos. Exclua corridas antigas."
}

// Mostra um aviso discreto sobre o espaço do navegador.
// estado: "quase", "cheio" ou null (esconde o aviso).
function atualizarAvisoArmazenamento(elemento, estado) {
    if (!elemento) return

    // Evita refazer o elemento a cada leitura de GPS.
    if ((elemento.dataset.estado || "") === (estado || "")) return
    elemento.dataset.estado = estado || ""

    if (!estado) {
        elemento.hidden = true
        elemento.replaceChildren()
        return
    }

    elemento.replaceChildren(
        criarElemento("i", "bi bi-exclamation-circle"),
        criarElemento("span", "", MENSAGENS_ARMAZENAMENTO[estado])
    )
    elemento.hidden = false
}

const SVG_NS = "http://www.w3.org/2000/svg"

function criarSvg(tag, atributos = {}, classe = "") {
    const elemento = document.createElementNS(SVG_NS, tag)
    Object.entries(atributos).forEach(([nome, valor]) => elemento.setAttribute(nome, valor))
    if (classe) elemento.setAttribute("class", classe)
    return elemento
}

// Medidas em pixels reais, para o texto não encolher em telas estreitas.
function medidasDoGrafico(area, serie, maxima) {
    const largura = Math.max(240, Math.floor(area.clientWidth) || 600)
    const altura = largura < 420 ? 190 : 230
    const margem = { topo: 12, direita: 14, base: 26, esquerda: 34 }
    const larguraUtil = largura - margem.esquerda - margem.direita
    const alturaUtil = altura - margem.topo - margem.base
    const tMin = serie[0].t
    const tMax = serie[serie.length - 1].t
    const { passo, topo } = escalaAgradavel(maxima)

    return {
        largura,
        altura,
        margem,
        larguraUtil,
        alturaUtil,
        base: margem.topo + alturaUtil,
        tMin,
        tMax,
        passo,
        topo,
        px: t => margem.esquerda + (t - tMin) / (tMax - tMin) * larguraUtil,
        py: v => margem.topo + alturaUtil - (v / topo) * alturaUtil
    }
}

function criarGraficoSvg(medidas, media, maxima) {
    const { largura, altura } = medidas
    const svg = criarSvg("svg", {
        width: largura,
        height: altura,
        viewBox: `0 0 ${largura} ${altura}`,
        role: "img",
        "aria-label":
            "Gráfico de velocidade ao longo do tempo. " +
            `Média de ${media.toFixed(1)} km/h e máxima de ${maxima.toFixed(1)} km/h.`
    }, "grafico-svg")

    const gradiente = criarSvg("linearGradient", { id: "gradienteVelocidade", x1: 0, y1: 0, x2: 0, y2: 1 })
    gradiente.append(
        criarSvg("stop", { offset: "0%" }, "grafico-gradiente-topo"),
        criarSvg("stop", { offset: "100%" }, "grafico-gradiente-base")
    )

    const definicoes = criarSvg("defs")
    definicoes.appendChild(gradiente)
    svg.appendChild(definicoes)
    return svg
}

function desenharEixosDoGrafico(svg, medidas) {
    const { margem, largura, altura, larguraUtil, passo, topo, tMin, tMax, px, py } = medidas
    const casas = passo < 1 ? 1 : 0

    for (let v = 0; v <= topo + passo / 1000; v += passo) {
        const y = py(v)
        svg.appendChild(criarSvg("line", {
            x1: margem.esquerda, x2: largura - margem.direita, y1: y, y2: y
        }, "grafico-grade"))

        const rotulo = criarSvg("text", {
            x: margem.esquerda - 6, y: y + 3.5, "text-anchor": "end"
        }, "grafico-texto")
        rotulo.textContent = v.toFixed(casas)
        svg.appendChild(rotulo)
    }

    const passoT = passoDeTempo(tMax - tMin, larguraUtil < 300 ? 4 : 6)
    for (let t = Math.ceil(tMin / passoT) * passoT; t <= tMax + 0.001; t += passoT) {
        const x = px(t)
        const ancora = x < margem.esquerda + 18 ? "start" : x > largura - margem.direita - 18 ? "end" : "middle"
        const rotulo = criarSvg("text", { x, y: altura - 8, "text-anchor": ancora }, "grafico-texto")
        rotulo.textContent = formatarDuracao(t * 1000)
        svg.appendChild(rotulo)
    }
}

function desenharCurvasDoGrafico(svg, medidas, trechos, media) {
    const { margem, largura, base, px, py } = medidas

    svg.appendChild(criarSvg("line", {
        x1: margem.esquerda, x2: largura - margem.direita, y1: py(media), y2: py(media)
    }, "grafico-media"))

    trechos.forEach(trecho => {
        const pontos = trecho.map(ponto => ({ x: px(ponto.t), y: py(ponto.v) }))

        if (pontos.length === 1) {
            svg.appendChild(criarSvg("circle", {
                cx: pontos[0].x, cy: pontos[0].y, r: 3
            }, "grafico-ponto-isolado"))
            return
        }

        const linha = caminhoCurvo(pontos)
        const primeiro = pontos[0]
        const ultimo = pontos[pontos.length - 1]
        svg.appendChild(criarSvg("path", {
            d: `${linha} L${ultimo.x} ${base} L${primeiro.x} ${base} Z`
        }, "grafico-preenchimento"))
        svg.appendChild(criarSvg("path", { d: linha }, "grafico-linha"))
    })
}

function pontoMaisProximo(serie, x, px) {
    return serie.reduce((melhor, ponto) =>
        Math.abs(px(ponto.t) - x) < Math.abs(px(melhor.t) - x) ? ponto : melhor
    )
}

// Toque ou mouse sobre o gráfico: mostra o valor e avisa o mapa (aoSelecionar).
function ligarToqueDoGrafico(svg, medidas, serie, leitura, textoPadrao, aoSelecionar) {
    const { margem, largura, larguraUtil, alturaUtil, base, px, py } = medidas
    const guia = criarSvg("line", { y1: margem.topo, y2: base }, "grafico-guia")
    const marcador = criarSvg("circle", { r: 4.5 }, "grafico-marcador")
    guia.style.display = "none"
    marcador.style.display = "none"

    const camada = criarSvg("rect", {
        x: margem.esquerda, y: margem.topo, width: larguraUtil, height: alturaUtil, fill: "transparent"
    })
    svg.append(guia, marcador, camada)

    function mostrarPonto(evento) {
        const caixa = svg.getBoundingClientRect()
        const x = (evento.clientX - caixa.left) * (largura / caixa.width)
        const ponto = pontoMaisProximo(serie, x, px)
        const cx = px(ponto.t)

        guia.setAttribute("x1", cx)
        guia.setAttribute("x2", cx)
        marcador.setAttribute("cx", cx)
        marcador.setAttribute("cy", py(ponto.v))
        guia.style.display = ""
        marcador.style.display = ""

        leitura.textContent = `${formatarDuracao(ponto.t * 1000)} · ${ponto.v.toFixed(1)} km/h`
        if (aoSelecionar) aoSelecionar(ponto)
    }

    function esconderPonto() {
        guia.style.display = "none"
        marcador.style.display = "none"
        leitura.textContent = textoPadrao
        if (aoSelecionar) aoSelecionar(null)
    }

    camada.addEventListener("pointermove", mostrarPonto)
    camada.addEventListener("pointerdown", mostrarPonto)
    camada.addEventListener("pointerleave", evento => {
        // Com o dedo, o valor fica na tela depois de soltar; com o mouse, volta ao padrão.
        if (evento.pointerType === "mouse") esconderPonto()
    })
}

function notaDoAgrupamento(serieBruta, serie) {
    if (serie.length >= serieBruta.length) return ""
    return `${serieBruta.length} leituras agrupadas em ${serie.length} pontos. ` +
        "O pico do gráfico é uma média e pode ficar abaixo da velocidade máxima."
}

// Desenha o gráfico de velocidade (km/h) x tempo, com curva suave, dentro de "area".
// "leitura" mostra o valor do ponto tocado; "nota" explica quando houve agrupamento.
// "aoSelecionar" (opcional) recebe o ponto { t, v } tocado (t em segundos desde o início)
// ou null quando a seleção termina. Serve para marcar o mesmo instante no mapa.
// Retorna false se não houver dados suficientes (o chamador pode esconder a seção).
function desenharGraficoVelocidade(corrida, area, leitura, nota, aoSelecionar) {
    area.replaceChildren()
    leitura.textContent = ""
    nota.textContent = ""
    if (aoSelecionar) aoSelecionar(null)

    const serieBruta = calcularSerieVelocidade(corrida)
    const serie = agruparSerie(serieBruta)
    if (serie.length < 2 || serie[serie.length - 1].t <= serie[0].t) return false

    const media = calcularMediaSerie(serieBruta)
    const maxima = Math.max(...serie.map(ponto => ponto.v))
    const textoPadrao = `Média ${media.toFixed(1)} km/h`
    const medidas = medidasDoGrafico(area, serie, maxima)
    const svg = criarGraficoSvg(medidas, media, maxima)

    leitura.textContent = textoPadrao
    nota.textContent = notaDoAgrupamento(serieBruta, serie)

    desenharEixosDoGrafico(svg, medidas)
    desenharCurvasDoGrafico(svg, medidas, dividirEmTrechos(serie), media)
    ligarToqueDoGrafico(svg, medidas, serie, leitura, textoPadrao, aoSelecionar)

    area.appendChild(svg)
    return true
}

// Cria um mapa Leaflet com tiles do OpenStreetMap.
// No tema escuro, estilos.css inverte só a camada de ruas.
function criarMapa(idElemento, opcoes = {}) {
    const mapa = L.map(idElemento, opcoes)
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        minZoom: 10,
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap",
        // Com CORS, o service worker guarda os tiles sem o custo de cota das respostas opacas.
        crossOrigin: true
    }).addTo(mapa)
    return mapa
}

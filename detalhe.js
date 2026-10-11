// Tela de detalhe: rota no mapa, gráfico de velocidade, parciais e exclusão da corrida.

const parametros = new URLSearchParams(window.location.search)
const idCorrida = parametros.get("id")
const paginaOrigem = parseInt(parametros.get("pagina"), 10) || 1
const urlHistorico = `./index.html?pagina=${paginaOrigem}`

const mapaElemento = document.querySelector("#mapaDetalhe")
const dadosElemento = document.querySelector("#dados")
const botaoExcluir = document.querySelector("#btnExcluir")

document.querySelector("#btnFechar").href = urlHistorico

// Mapa e camadas, para o gráfico e o botão de cores poderem mexer neles.
let mapa = null
let rotaSimples = null
let marcadorDoGrafico = null

function mostrarAviso(titulo, texto) {
    mapaElemento.classList.add("d-none")
    botaoExcluir.classList.add("d-none")

    const aviso = criarElemento("div", "estado-vazio")
    aviso.append(
        criarElemento("h2", "", titulo),
        criarElemento("p", "", texto)
    )
    dadosElemento.appendChild(aviso)
}

function desenharRota(corrida) {
    const primeira = corrida.posicoes[0]

    mapa = criarMapa("mapaDetalhe")
    mapa.setView([primeira.latitude, primeira.longitude], 15)

    const pontos = corrida.posicoes.map(posicao => [posicao.latitude, posicao.longitude])
    rotaSimples = L.polyline(pontos, { color: "#F00" }).addTo(mapa)

    mapa.fitBounds(rotaSimples.getBounds())
}

// Botão "Cor por velocidade". Só aparece quando a rota não passa por cima de si mesma:
// em pistas e circuitos as voltas se sobrepõem e a cor não se lê. Nesses casos a rota
// continua vermelha e os dados por volta ficam nas parciais.
function configurarCoresDoMapa(trajeto) {
    if (!mapa || rotaEhCircuito(trajeto)) return

    const trechos = calcularTrechosPorVelocidade(trajeto)
    if (trechos.length < 3) return

    const escala = calcularEscalaDeCores(trechos)
    const camadaColorida = L.layerGroup(trechos.map(trecho =>
        L.polyline(trecho.pontos, {
            color: corDaVelocidade(trecho.velocidade, escala),
            weight: 5,
            opacity: 0.95,
            lineCap: "round",
            lineJoin: "round",
            interactive: false
        })
    ))

    const barra = document.querySelector("#barraMapa")
    const botao = document.querySelector("#btnCorVelocidade")
    const legenda = document.querySelector("#legendaVelocidade")

    document.querySelector("#legendaMinimo").textContent = Math.round(escala.minimo)
    document.querySelector("#legendaMaximo").textContent = Math.round(escala.maximo)

    function definirCores(ativas) {
        botao.setAttribute("aria-pressed", String(ativas))
        legenda.classList.toggle("d-none", !ativas)

        if (ativas) {
            rotaSimples.remove()
            camadaColorida.addTo(mapa)
        } else {
            camadaColorida.remove()
            rotaSimples.addTo(mapa)
        }

        // As camadas recém-adicionadas ficariam por cima do marcador do gráfico.
        if (marcadorDoGrafico) marcadorDoGrafico.bringToFront()
    }

    botao.addEventListener("click", () => definirCores(botao.getAttribute("aria-pressed") !== "true"))

    barra.classList.remove("d-none")
    definirCores(true)
}

// Função chamada pelo gráfico: marca no mapa onde a pessoa estava no instante tocado.
function criarDestaqueNoMapa(corrida, trajeto) {
    return ponto => {
        if (!mapa) return

        if (!ponto) {
            if (marcadorDoGrafico) {
                marcadorDoGrafico.remove()
                marcadorDoGrafico = null
            }
            return
        }

        const posicao = posicaoNoTempo(trajeto, corrida.inicio + ponto.t * 1000)
        if (!posicao) return

        const coordenadas = [posicao.latitude, posicao.longitude]

        if (!marcadorDoGrafico) {
            marcadorDoGrafico = L.circleMarker(coordenadas, {
                radius: 8,
                color: "#ffffff",
                weight: 3,
                fillColor: "#0ea5e9",
                fillOpacity: 1,
                interactive: false
            }).addTo(mapa)
        } else {
            marcadorDoGrafico.setLatLng(coordenadas)
        }

        // Se o mapa foi arrastado ou ampliado e o ponto saiu da vista, traz o ponto de volta.
        if (!mapa.getBounds().contains(coordenadas))
            mapa.panTo(coordenadas)
    }
}

// Mostra o gráfico de velocidade e o redesenha quando a largura da tela muda
// (girar o celular, redimensionar a janela).
function mostrarGrafico(corrida, trajeto) {
    const secao = document.querySelector("#graficoVelocidade")
    const area = document.querySelector("#graficoArea")
    const leitura = document.querySelector("#graficoLeitura")
    const nota = document.querySelector("#graficoNota")
    const destacarNoMapa = criarDestaqueNoMapa(corrida, trajeto)

    // A seção precisa estar visível para a largura ser medida.
    secao.classList.remove("d-none")

    if (!desenharGraficoVelocidade(corrida, area, leitura, nota, destacarNoMapa)) {
        secao.classList.add("d-none")
        return
    }

    let larguraDesenhada = area.clientWidth
    new ResizeObserver(() => {
        if (area.clientWidth === larguraDesenhada) return
        larguraDesenhada = area.clientWidth
        desenharGraficoVelocidade(corrida, area, leitura, nota, destacarNoMapa)
    }).observe(area)
}

// Entre os trechos completos, o de menor ritmo é o mais rápido e o de maior é o mais lento.
// Com menos de dois trechos completos (ou todos iguais) não há o que destacar.
function extremosDeRitmo(parciais) {
    const completas = parciais.filter(parcial => !parcial.parcial)
    if (completas.length < 2) return { rapida: null, lenta: null }

    const rapida = completas.reduce((melhor, parcial) => (parcial.ritmo < melhor.ritmo ? parcial : melhor))
    const lenta = completas.reduce((pior, parcial) => (parcial.ritmo > pior.ritmo ? parcial : pior))

    return rapida === lenta ? { rapida: null, lenta: null } : { rapida, lenta }
}

function criarLinhaDeParcial(parcial, ehVolta, destaque) {
    const classe = parcial.parcial ? "parcial-incompleta"
        : destaque === "rapida" ? "parcial-rapida"
        : destaque === "lenta" ? "parcial-lenta"
        : ""
    const linha = criarElemento("tr", classe)

    const numero = criarElemento("td", "", ehVolta ? `V${parcial.numero}` : String(parcial.numero))

    if (destaque) {
        const rapida = destaque === "rapida"
        numero.append(
            " ",
            criarElemento("i", rapida ? "bi bi-caret-up-fill parcial-icone-rapida" : "bi bi-caret-down-fill parcial-icone-lenta"),
            criarElemento("span", "visually-hidden", rapida ? " mais rápida" : " mais lenta")
        )
    }

    linha.append(
        numero,
        criarElemento("td", "", parcial.distanciaKm.toFixed(2)),
        criarElemento("td", "", formatarDuracao(parcial.duracaoMs)),
        criarElemento("td", "", formatarRitmo(parcial.ritmo)),
        criarElemento("td", "", parcial.velocidadeMedia.toFixed(1))
    )

    return linha
}

// Tabela de parciais por km e, em pistas e circuitos, por volta.
function mostrarParciais(trajeto) {
    const porKm = calcularParciaisPorKm(trajeto)
    const voltas = detectarVoltas(trajeto)
    if (porKm.length === 0 && voltas.length === 0) return

    const secao = document.querySelector("#parciais")
    const titulo = document.querySelector("#parciaisTitulo")
    const seletor = document.querySelector("#parciaisModo")
    const coluna = document.querySelector("#parciaisColuna")
    const corpo = document.querySelector("#parciaisCorpo")
    const notaIncompleta = document.querySelector("#parciaisNotaIncompleta")

    const modos = { km: porKm, volta: voltas }
    let modo = voltas.length > 0 ? "volta" : "km"

    // Só há o que alternar quando existem voltas.
    seletor.classList.toggle("d-none", voltas.length === 0)

    function desenhar() {
        const parciais = modos[modo]
        const ehVolta = modo === "volta"

        titulo.textContent = voltas.length > 0 ? "Parciais" : "Parciais por km"
        coluna.textContent = ehVolta ? "Volta" : "Km"
        seletor.querySelectorAll("button").forEach(botao =>
            botao.setAttribute("aria-pressed", String(botao.dataset.modo === modo))
        )

        const extremos = extremosDeRitmo(parciais)

        corpo.replaceChildren(...parciais.map(parcial => {
            const destaque = parcial === extremos.rapida ? "rapida" : parcial === extremos.lenta ? "lenta" : null
            return criarLinhaDeParcial(parcial, ehVolta, destaque)
        }))

        notaIncompleta.classList.toggle("d-none", !parciais.some(parcial => parcial.parcial))
    }

    seletor.querySelectorAll("button").forEach(botao =>
        botao.addEventListener("click", () => {
            modo = botao.dataset.modo
            desenhar()
        })
    )

    secao.classList.remove("d-none")
    desenhar()
}

function iniciar() {
    const corrida = idCorrida ? obterCorrida(idCorrida) : null

    if (!corrida) {
        mostrarAviso("Corrida não encontrada", "Ela pode ter sido excluída. Use o botão X para voltar ao histórico.")
        return
    }

    dadosElemento.appendChild(criarBlocoDeDados(corrida, true))

    const trajeto = calcularTrajeto(corrida)

    // O mapa vem antes: o gráfico e a cor por velocidade dependem dele.
    if (corrida.posicoes.length > 0) {
        desenharRota(corrida)
        configurarCoresDoMapa(trajeto)
    } else {
        mapaElemento.classList.add("d-none")
    }

    mostrarGrafico(corrida, trajeto)
    mostrarParciais(trajeto)

    botaoExcluir.addEventListener("click", () => {
        if (!confirm("Deseja realmente excluir esta corrida? Esta ação não pode ser desfeita."))
            return

        excluirCorrida(corrida.id)
        window.location.href = urlHistorico
    })
}

iniciar()

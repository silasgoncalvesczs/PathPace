// Tela principal: histórico de corridas com paginação.

const listaElemento = document.querySelector("#listaCorridas")
const controlesTopo = document.querySelector("#controlesTopo")
const resumoPagina = document.querySelector("#resumoPagina")
const seletorPorPagina = document.querySelector("#porPagina")
const paginacao = document.querySelector("#paginacao")
const botaoAnterior = document.querySelector("#btnAnterior")
const botaoProxima = document.querySelector("#btnProxima")
const indicadorPagina = document.querySelector("#indicadorPagina")

const todasCorridas = obterTodasCorridas()
let porPagina = obterPorPagina()
let paginaAtual = parseInt(new URLSearchParams(window.location.search).get("pagina"), 10) || 1
let mapasAtivos = []

function criarCard(corrida) {
    const item = criarElemento("li", "card-corrida")
    item.tabIndex = 0
    item.setAttribute("role", "link")
    item.setAttribute("aria-label", `Abrir corrida de ${formatarDataInicio(corrida.inicio)}`)

    const abrir = () => {
        window.location.href = `./detalhe.html?id=${corrida.id}&pagina=${paginaAtual}`
    }
    item.addEventListener("click", abrir)
    item.addEventListener("keydown", evento => {
        if (evento.key === "Enter" || evento.key === " ") {
            evento.preventDefault()
            abrir()
        }
    })

    const mapaElemento = criarElemento("div", "miniatura-mapa")
    mapaElemento.id = `mapa${corrida.id}`

    item.append(mapaElemento, criarBlocoDeDados(corrida))

    return { item, mapaElemento }
}

function criarMiniatura(corrida, mapaElemento) {
    const primeira = corrida.posicoes[0]

    const mapa = criarMapa(mapaElemento.id, {
        attributionControl: false,
        zoomControl: false,
        dragging: false,
        scrollWheelZoom: false,
        keyboard: false
    })
    mapa.setView([primeira.latitude, primeira.longitude], 15)
    L.marker([primeira.latitude, primeira.longitude], {
        interactive: false,
        keyboard: false
    }).addTo(mapa)

    mapasAtivos.push(mapa)
}

function mostrarMensagemVazia() {
    const mensagem = criarElemento("div", "estado-vazio")
    mensagem.append(
        criarElemento("h2", "", "Nenhuma corrida registrada"),
        criarElemento("p", "", "Toque no botão + para iniciar sua primeira corrida.")
    )
    listaElemento.appendChild(mensagem)
}

function renderizar() {
    // Libera os mapas da página anterior antes de montar os novos.
    mapasAtivos.forEach(mapa => mapa.remove())
    mapasAtivos = []
    listaElemento.replaceChildren()

    if (todasCorridas.length === 0) {
        controlesTopo.classList.add("d-none")
        paginacao.classList.add("d-none")
        mostrarMensagemVazia()
        return
    }

    const totalPaginas = Math.max(1, Math.ceil(todasCorridas.length / porPagina))
    paginaAtual = Math.min(Math.max(1, paginaAtual), totalPaginas)

    const inicio = (paginaAtual - 1) * porPagina
    const corridasDaPagina = todasCorridas.slice(inicio, inicio + porPagina)

    corridasDaPagina.forEach(corrida => {
        const { item, mapaElemento } = criarCard(corrida)
        listaElemento.appendChild(item)

        // O mapa só pode ser criado depois que o elemento está na página.
        if (corrida.posicoes.length > 0)
            criarMiniatura(corrida, mapaElemento)
        else {
            mapaElemento.classList.add("miniatura-vazia")
            mapaElemento.appendChild(criarElemento("i", "bi bi-geo-alt"))
        }
    })

    resumoPagina.textContent =
        `Mostrando ${inicio + 1}–${inicio + corridasDaPagina.length} de ${todasCorridas.length}`
    indicadorPagina.textContent = `Página ${paginaAtual} de ${totalPaginas}`
    botaoAnterior.disabled = paginaAtual <= 1
    botaoProxima.disabled = paginaAtual >= totalPaginas

    controlesTopo.classList.remove("d-none")
    paginacao.classList.toggle("d-none", totalPaginas === 1)

    // Mantém a página na URL, para o botão "voltar" do detalhe cair no mesmo lugar.
    history.replaceState(null, "", `?pagina=${paginaAtual}`)
}

function irParaPagina(pagina) {
    paginaAtual = pagina
    renderizar()
    window.scrollTo({ top: 0 })
}

atualizarAvisoArmazenamento(document.querySelector("#avisoArmazenamento"), obterEstadoArmazenamento())

// Se uma corrida ficou sem ser finalizada, oferece voltar para ela.
if (obterCorridaAtiva())
    document.querySelector("#avisoCorridaAtiva").classList.remove("d-none")

OPCOES_POR_PAGINA.forEach(opcao => {
    const elemento = criarElemento("option", "", String(opcao))
    elemento.value = opcao
    elemento.selected = opcao === porPagina
    seletorPorPagina.appendChild(elemento)
})

seletorPorPagina.addEventListener("change", () => {
    porPagina = parseInt(seletorPorPagina.value, 10)
    salvarPorPagina(porPagina)
    irParaPagina(1)
})

botaoAnterior.addEventListener("click", () => irParaPagina(paginaAtual - 1))
botaoProxima.addEventListener("click", () => irParaPagina(paginaAtual + 1))

renderizar()

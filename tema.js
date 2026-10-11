// Tema claro/escuro. A escolha fica em pathpace:tema.
// Se ainda não houver escolha, o tema do sistema é usado.

const CHAVE_TEMA = "pathpace:tema"
const COR_BARRA = { claro: "#eef2f6", escuro: "#0e141b" }

function temaSalvo() {
    try {
        const valor = localStorage.getItem(CHAVE_TEMA)
        return valor === "claro" || valor === "escuro" ? valor : null
    } catch (erro) {
        return null
    }
}

function temaEfetivo() {
    return document.documentElement.getAttribute("data-tema") === "escuro" ? "escuro" : "claro"
}

function aplicarTema(tema) {
    const escuro = tema === "escuro"
    const raiz = document.documentElement
    raiz.setAttribute("data-bs-theme", escuro ? "dark" : "light")
    raiz.setAttribute("data-tema", escuro ? "escuro" : "claro")

    // Cor da barra de status/título do aplicativo instalado.
    const corBarra = document.querySelector('meta[name="theme-color"]')
    if (corBarra)
        corBarra.setAttribute("content", escuro ? COR_BARRA.escuro : COR_BARRA.claro)

    document.querySelectorAll("[data-botao-tema]").forEach(botao => {
        const icone = botao.querySelector("i")
        if (icone)
            icone.className = escuro ? "bi bi-sun" : "bi bi-moon-stars"
        botao.setAttribute("aria-label", escuro ? "Usar tema claro" : "Usar tema escuro")
        botao.setAttribute("title", escuro ? "Tema claro" : "Tema escuro")
    })
}

function alternarTema() {
    const proximo = temaEfetivo() === "escuro" ? "claro" : "escuro"
    try {
        localStorage.setItem(CHAVE_TEMA, proximo)
    } catch (erro) {
        console.error("Não foi possível salvar o tema:", erro)
    }
    aplicarTema(proximo)
}

function iniciarTema() {
    document.querySelectorAll("[data-botao-tema]").forEach(botao => {
        botao.addEventListener("click", alternarTema)
    })
    aplicarTema(temaEfetivo())

    const consulta = window.matchMedia("(prefers-color-scheme: dark)")
    consulta.addEventListener("change", evento => {
        if (!temaSalvo())
            aplicarTema(evento.matches ? "escuro" : "claro")
    })
}

iniciarTema()

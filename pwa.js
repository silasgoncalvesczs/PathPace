// PWA: registra o service worker e controla o botão "Instalar aplicativo".

if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("./service-worker.js").catch(erro => {
            console.error("Não foi possível registrar o service worker:", erro)
        })
    })
}

let eventoInstalacao = null

function botoesDeInstalar() {
    return document.querySelectorAll("[data-botao-instalar]")
}

function mostrarBotoesDeInstalar(mostrar) {
    botoesDeInstalar().forEach(botao => botao.classList.toggle("d-none", !mostrar))
}

// O navegador só dispara este evento quando o app pode ser instalado.
window.addEventListener("beforeinstallprompt", evento => {
    evento.preventDefault()
    eventoInstalacao = evento
    mostrarBotoesDeInstalar(true)
})

window.addEventListener("appinstalled", () => {
    eventoInstalacao = null
    mostrarBotoesDeInstalar(false)
})

botoesDeInstalar().forEach(botao => {
    botao.addEventListener("click", async () => {
        if (!eventoInstalacao) return

        eventoInstalacao.prompt()
        await eventoInstalacao.userChoice
        eventoInstalacao = null
        mostrarBotoesDeInstalar(false)
    })
})

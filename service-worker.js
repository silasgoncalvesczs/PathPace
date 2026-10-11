// Service worker do PathPace: deixa o app abrir sem internet.
//
// - Arquivos do app: rede primeiro (pega a versão nova quando online) e cache como reserva.
// - Bibliotecas de CDN (Bootstrap, Leaflet): cache primeiro, atualizando em segundo plano.
// - Tiles do OpenStreetMap: cache primeiro, com limite de quantidade.
// - Geocodificação (BigDataCloud): sempre rede. O app já trata a falha e mostra "Local desconhecido".
//
// Os dados das corridas ficam no localStorage e não passam por aqui.
//
// Ao publicar uma mudança nos arquivos, aumente a VERSAO para limpar os caches antigos.

const VERSAO = "v5"
const CACHE_APP = `pathpace-app-${VERSAO}`
const CACHE_EXTERNO = `pathpace-externo-${VERSAO}`
const CACHE_MAPA = "pathpace-mapa"

const LIMITE_TILES = 200
const TEMPO_REDE_MS = 4000

const ARQUIVOS_APP = [
    "./",
    "./index.html",
    "./velocimetro.html",
    "./detalhe.html",
    "./estilos.css",
    "./armazenamento.js",
    "./calculos.js",
    "./local.js",
    "./tema.js",
    "./interface.js",
    "./pwa.js",
    "./index.js",
    "./velocimetro.js",
    "./detalhe.js",
    "./manifest.webmanifest",
    "./assets/PathPace_logo.png",
    "./assets/icones/icone-192.png",
    "./assets/icones/icone-512.png",
    "./assets/icones/icone-maskable-512.png",
    "./assets/icones/apple-touch-icon.png"
]

const CSS_ICONES = "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css"

const ARQUIVOS_EXTERNOS = [
    "https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha3/dist/css/bootstrap.min.css",
    CSS_ICONES,
    "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
    "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png"
]

async function guardarExterno(cache, url) {
    try {
        const resposta = await fetch(url, { mode: "cors" })
        if (resposta.ok) await cache.put(url, resposta.clone())
        return resposta
    } catch (erro) {
        console.warn("Não foi possível guardar em cache:", url, erro)
        return null
    }
}

// As fontes do Bootstrap Icons só aparecem dentro do CSS; lê o CSS para guardá-las também.
async function guardarFontesDosIcones(cache) {
    const resposta = await guardarExterno(cache, CSS_ICONES)
    if (!resposta || !resposta.ok) return

    const css = await resposta.clone().text()
    const urls = [...css.matchAll(/url\(["']?([^"')]+)["']?\)/g)]
        .map(m => new URL(m[1], CSS_ICONES).href)

    await Promise.all(urls.map(url => guardarExterno(cache, url)))
}

self.addEventListener("install", evento => {
    evento.waitUntil((async () => {
        const app = await caches.open(CACHE_APP)
        await app.addAll(ARQUIVOS_APP)

        const externo = await caches.open(CACHE_EXTERNO)
        await Promise.all(
            ARQUIVOS_EXTERNOS.filter(url => url !== CSS_ICONES).map(url => guardarExterno(externo, url))
        )
        await guardarFontesDosIcones(externo)

        await self.skipWaiting()
    })())
})

self.addEventListener("activate", evento => {
    evento.waitUntil((async () => {
        const mantidos = [CACHE_APP, CACHE_EXTERNO, CACHE_MAPA]
        const nomes = await caches.keys()
        await Promise.all(
            nomes.filter(nome => nome.startsWith("pathpace-") && !mantidos.includes(nome))
                .map(nome => caches.delete(nome))
        )
        await self.clients.claim()
    })())
})

// A chave ignora a query string (detalhe.html?id=...), para guardar cada página uma vez só.
function chaveDaPagina(url) {
    return new Request(url.origin + url.pathname)
}

function comTempoLimite(promessa, ms) {
    return new Promise((resolve, reject) => {
        const temporizador = setTimeout(() => reject(new Error("tempo esgotado")), ms)
        promessa.then(
            valor => { clearTimeout(temporizador); resolve(valor) },
            erro => { clearTimeout(temporizador); reject(erro) }
        )
    })
}

async function redePrimeiro(requisicao, evento) {
    const url = new URL(requisicao.url)
    const cache = await caches.open(CACHE_APP)
    const chave = chaveDaPagina(url)

    const rede = fetch(requisicao).then(resposta => {
        if (resposta.ok) cache.put(chave, resposta.clone())
        return resposta
    })
    evento.waitUntil(rede.catch(() => null))

    try {
        return await comTempoLimite(rede, TEMPO_REDE_MS)
    } catch (erro) {
        const guardada = await cache.match(chave, { ignoreSearch: true })
        if (guardada) return guardada

        if (requisicao.mode === "navigate") {
            const inicio = await cache.match("./index.html")
            if (inicio) return inicio
        }
        // Sem cache: espera a rede de verdade, se ainda estiver tentando.
        return rede
    }
}

async function cacheComAtualizacao(requisicao, evento) {
    const cache = await caches.open(CACHE_EXTERNO)
    const guardada = await cache.match(requisicao)

    const rede = fetch(requisicao).then(resposta => {
        if (resposta.ok || resposta.type === "opaque") cache.put(requisicao, resposta.clone())
        return resposta
    })
    evento.waitUntil(rede.catch(() => null))

    return guardada || rede
}

async function limitarTiles(cache) {
    const chaves = await cache.keys()
    const excesso = chaves.length - LIMITE_TILES
    for (let i = 0; i < excesso; i++)
        await cache.delete(chaves[i])
}

async function tilesDoMapa(requisicao, evento) {
    const cache = await caches.open(CACHE_MAPA)
    const guardada = await cache.match(requisicao)
    if (guardada) return guardada

    const resposta = await fetch(requisicao)
    if (resposta.ok || resposta.type === "opaque") {
        evento.waitUntil(
            cache.put(requisicao, resposta.clone()).then(() => limitarTiles(cache))
        )
    }
    return resposta
}

self.addEventListener("fetch", evento => {
    const requisicao = evento.request
    if (requisicao.method !== "GET") return

    const url = new URL(requisicao.url)

    if (url.origin === self.location.origin) {
        evento.respondWith(redePrimeiro(requisicao, evento))
    } else if (url.hostname === "tile.openstreetmap.org") {
        evento.respondWith(tilesDoMapa(requisicao, evento))
    } else if (url.hostname === "cdn.jsdelivr.net" || url.hostname === "unpkg.com") {
        evento.respondWith(cacheComAtualizacao(requisicao, evento))
    }
    // Qualquer outro endereço (como a geocodificação) segue direto para a rede.
})

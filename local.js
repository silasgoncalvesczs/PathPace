// Nome da cidade onde a corrida começou.
// O resultado fica salvo na própria corrida, então a API é consultada uma vez só.

async function buscarDadosDeLocal(latitude, longitude) {
    const url = "https://api.bigdatacloud.net/data/reverse-geocode-client" +
        `?latitude=${latitude}&longitude=${longitude}&localityLanguage=pt`

    const resposta = await fetch(url)
    if (!resposta.ok)
        throw new Error(`Falha na geocodificação (HTTP ${resposta.status})`)

    return await resposta.json()
}

function montarNomeDoLocal(dados) {
    const partes = [dados.locality || dados.city, dados.principalSubdivision].filter(Boolean)
    const nome = partes.join(", ")

    if (!dados.countryCode) return nome
    return nome ? `${nome} - ${dados.countryCode}` : dados.countryCode
}

async function obterLocalDaCorrida(corrida) {
    if (corrida.local) return corrida.local
    if (corrida.posicoes.length === 0) return "Sem dados de GPS"

    try {
        const primeira = corrida.posicoes[0]
        const local = montarNomeDoLocal(await buscarDadosDeLocal(primeira.latitude, primeira.longitude))
        if (!local) return "Local desconhecido"

        // Relê a corrida antes de salvar, para não sobrescrever uma gravação mais recente.
        const atual = obterCorrida(corrida.id)
        if (atual) {
            atual.local = local
            salvarCorrida(atual)
        }

        return local
    } catch (erro) {
        console.error("Não foi possível obter o local:", erro)
        return "Local desconhecido"
    }
}

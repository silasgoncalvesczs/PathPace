const speedElement = document.querySelector("#speed");
const startBtn = document.querySelector("#start");
const stopBtn = document.querySelector("#stop");

// Novos elementos
const distanceElement = document.querySelector("#distance");
const durationElement = document.querySelector("#duration");

let watchID = null;
let currentRide = null;
let durationInterval = null;

// Variável para guardar o controle do Wake Lock
let wakeLock = null;

// Função para solicitar o bloqueio de tela
const requestWakeLock = async () => {
    // Verifica se o navegador suporta a API
    if ('wakeLock' in navigator) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('Wake Lock ativado com sucesso!');
        } catch (err) {
            console.error(`${err.name}, ${err.message}`);
        }
    } else {
        console.log('Wake Lock API não é suportada neste navegador.');
    }
};

// Função para liberar o bloqueio de tela
const releaseWakeLock = async () => {
    if (wakeLock) {
        await wakeLock.release();
        wakeLock = null;
        console.log('Wake Lock liberado.');
    }
};

startBtn.addEventListener("click", () => {
    if (watchID)
        return

    // >>> NOVO: Solicita o bloqueio de tela ao iniciar
    requestWakeLock();

    function handleSuccess(position) {
        addPosition(currentRide, position)

        console.log(position)
        // Atualiza a velocidade (como já fazia)
        speedElement.innerText = position.coords.speed ? (position.coords.speed * 3.6).toFixed(1) : 0

        // Calcula e atualiza a distância
        const rideRecord = getRideRecord(currentRide);
        distanceElement.innerText = getDistance(rideRecord.data);
    }

    function handleError(error) {
        console.log(error.msg)
    }

    const options = { enableHighAccuracy: true }

    currentRide = createNewRide()
    watchID = navigator.geolocation.watchPosition(handleSuccess, handleError, options)

    // Inicia o cronômetro para a duração
    durationInterval = setInterval(() => {
        const rideRecord = getRideRecord(currentRide);
        const duration = getDuration({
            startTime: rideRecord.startTime,
            stopTime: Date.now()
        });
        durationElement.innerText = duration;
    }, 1000);

    startBtn.classList.add("d-none")
    stopBtn.classList.remove("d-none")
})

stopBtn.addEventListener("click", () => {
    if (!watchID)
        return

    // >>> NOVO: Libera o bloqueio de tela ao parar
    releaseWakeLock();

    // Para o cronômetro e o GPS
    clearInterval(durationInterval);
    navigator.geolocation.clearWatch(watchID)
    watchID = null

    updateStopTime(currentRide)
    currentRide = null

    // Reseta os displays
    speedElement.innerText = "0";
    distanceElement.innerText = "0.00";
    durationElement.innerText = "00:00";

    startBtn.classList.remove("d-none")
    stopBtn.classList.add("d-none")

    window.location.href = "./"
})

// Opcional, mas recomendado: Lida com a visibilidade da aba
// Se o usuário mudar de aba, o wake lock é liberado. Esta função o reativa quando ele volta.
document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible') {
        await requestWakeLock();
    }
});
// tela principal

const rideListElement = document.querySelector("#rideList")
const allRides = getAllRides()

// VERIFICA SE A LISTA DE CORRIDAS ESTÁ VAZIA
if (allRides.length === 0) {
    const emptyMessage = document.createElement("div");
    emptyMessage.className = "text-center p-5";
    emptyMessage.innerHTML = `
        <h5 class="text-muted">Nenhuma corrida registrada</h5>
        <p class="text-muted">Clique no botão <i class="bi bi-plus-lg"></i> para iniciar sua primeira corrida!</p>
    `;
    rideListElement.appendChild(emptyMessage);
} else {
    // Se não estiver vazia, continua com o código que você já tinha
    allRides.forEach(async ([id, value]) => {
        const ride = JSON.parse(value)
        ride.id = id

        // Linhas criar cards em lista
        const itemElement = document.createElement("li")
        itemElement.id = ride.id
        itemElement.className = "card bg-light text-dark d-flex p-1 m-1 align-items-center justify-content-between gap-3"

        rideListElement.appendChild(itemElement)

        itemElement.addEventListener("click", () => {
            window.location.href = `./detail.html?id=${ride.id}`
        })

        const firstPosition = ride.data[0]
        const firstLocationData = await getLocationData(firstPosition.latitude, firstPosition.longitude)
        // console.log(firstLocationData)

        const mapID = `map${ride.id}`
        const mapElement = document.createElement("div")
        mapElement.id = mapID
        mapElement.style = "width:100px;height:100px"
        mapElement.classList.add("bg-secondary")
        mapElement.classList.add("rounded-4")

        const dataElement = document.createElement("div")
        dataElement.className = "flex-fill d-flex flex-column"

        const cityDiv = document.createElement("div")
        cityDiv.innerText = `${firstLocationData.city}, ${firstLocationData.principalSubdivision} - ${firstLocationData.countryCode}`
        cityDiv.className = "text-primary mb-2"

        const maxSpeedDiv = document.createElement("div")
        maxSpeedDiv.innerText = `Max speed: ${getMaxSpeed(ride.data)} km/h`
        maxSpeedDiv.className = "h5"

        const distanceDiv = document.createElement("div")
        distanceDiv.innerText = `Distance: ${getDistance(ride.data)} km`

        const durationDiv = document.createElement("div")
        durationDiv.innerText = `Duration: ${getDuration(ride)}`

        const dateDiv = document.createElement("div")
        dateDiv.innerText = getStartDate(ride)
        dateDiv.className = "text-secondary mt-2"

        dataElement.appendChild(cityDiv)
        dataElement.appendChild(maxSpeedDiv)
        dataElement.appendChild(distanceDiv)
        dataElement.appendChild(durationDiv)
        dataElement.appendChild(dateDiv)

        itemElement.appendChild(mapElement)
        itemElement.appendChild(dataElement)

        const map = L.map(mapID, {
            attributionControl: false,
            zoomControl: false,
            dragging: false,
            scrollWheelZoom: false
        })
        map.setView([firstPosition.latitude, firstPosition.longitude], 15)
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            subdomains: 'abcd',
            minZoom: 10,
            maxZoom: 19,
            ext: 'png'
        }).addTo(map);

        L.marker([firstPosition.latitude, firstPosition.longitude]).addTo(map)
    })
}
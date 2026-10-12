/**
 * GeolocationNavigationEngine: Rastreia a coordenada GPS real do passageiro,
 * detecta progressão de paradas, alertas de 3 paradas e chegada final na linha 875C-10.
 */
class GeolocationNavigationEngine {
  constructor(stopsData, audioHaptics) {
    this.stops = stopsData || [];
    this.audioHaptics = audioHaptics;
    this.watchId = null;
    this.currentPosition = null;
    this.currentStopIndex = 0;
    this.destinationStop = null;
    this.onUpdateCallback = null;
    this.hasAlertedThreeStops = false;
    this.hasAlertedBusArrival = false;
  }

  // Fórmula de Haversine para cálculo de distância em metros entre duas coordenadas WGS84
  calculateDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Raio da Terra em metros
    const toRad = Math.PI / 180;
    const dLat = (lat2 - lat1) * toRad;
    const dLon = (lon2 - lon1) * toRad;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  startTracking(onUpdate) {
    this.onUpdateCallback = onUpdate;
    if (!('geolocation' in navigator)) {
      console.warn('Geolocalização não disponível no navegador.');
      return;
    }

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.handleNewPosition(pos.coords.latitude, pos.coords.longitude),
      (err) => console.warn('Erro de Geolocalização:', err.message),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
    );
  }

  stopTracking() {
    if (this.watchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  setDestination(stop) {
    this.destinationStop = stop;
    this.hasAlertedThreeStops = false;
    this.hasAlertedBusArrival = false;
  }

  handleNewPosition(lat, lng) {
    this.currentPosition = { lat, lng };

    // Encontra a parada mais próxima da posição atual do usuário
    let nearestIndex = 0;
    let minDistance = Infinity;

    this.stops.forEach((stop, index) => {
      const dist = this.calculateDistanceMeters(lat, lng, stop.lat, stop.lng);
      if (dist < minDistance) {
        minDistance = dist;
        nearestIndex = index;
      }
    });

    const previousIndex = this.currentStopIndex;
    this.currentStopIndex = nearestIndex;

    // Se mudou de parada durante a viagem
    if (nearestIndex !== previousIndex && this.destinationStop) {
      this.audioHaptics.playStopTick();
      this.audioHaptics.vibrateStopPassed();
    }

    // Calcula paradas restantes até o destino
    if (this.destinationStop) {
      const destIndex = this.stops.findIndex(s => s.id === this.destinationStop.id);
      const stopsRemaining = Math.max(0, destIndex - this.currentStopIndex);
      const distanceToDestination = this.calculateDistanceMeters(
        lat, lng, this.destinationStop.lat, this.destinationStop.lng
      );

      // Alerta de 3 paradas
      if (stopsRemaining === 3 && !this.hasAlertedThreeStops) {
        this.hasAlertedThreeStops = true;
        this.audioHaptics.playThreeStopsNotice();
        this.audioHaptics.vibrateThreeStopsRemaining();
      }

      // Alerta de chegada (menos de 60 metros ou paradas restantes == 0)
      if (stopsRemaining === 0 || distanceToDestination < 60) {
        this.audioHaptics.playArrivalFanfare();
        this.audioHaptics.vibrateArrival();
      }
    }

    if (this.onUpdateCallback) {
      this.onUpdateCallback({
        coords: this.currentPosition,
        currentStop: this.stops[this.currentStopIndex],
        stopsRemaining: this.destinationStop
          ? Math.max(0, this.stops.findIndex(s => s.id === this.destinationStop.id) - this.currentStopIndex)
          : null
      });
    }
  }

  // Método para simulação com coordenadas reais dos testes
  simulatePosition(lat, lng) {
    this.handleNewPosition(lat, lng);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = GeolocationNavigationEngine;
}

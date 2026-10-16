import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Car, Clock, MapPin, PlusCircle, Users, CheckCircle, Navigation, Loader2 } from 'lucide-react';

// Fix default Leaflet icon assets in Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Helper function: Convert GPS Lat/Lng into real street address using Nominatim OpenStreetMap API
async function reverseGeocode(lat, lng) {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`
    );
    const data = await response.json();
    if (data && data.display_name) {
      // Pick address short parts (road, neighborhood, suburb, or city)
      const addr = data.address;
      const shortName = [
        addr.amenity || addr.building || addr.road || addr.pedestrian,
        addr.neighbourhood || addr.suburb || addr.residential,
        addr.city || addr.town || addr.village
      ].filter(Boolean).join(', ');

      return shortName || data.display_name.split(',').slice(0, 3).join(',');
    }
  } catch (err) {
    console.error('Geocoding error:', err);
  }
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

// Helper component: Smoothly pans map to new coordinates
function MapFlyTo({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.flyTo(center, 15, { animate: true, duration: 1.5 });
    }
  }, [center, map]);
  return null;
}

// Helper component: Captures map clicks and reverse geocodes to real addresses
function MapClickHandler({ activeSelection, setPickupCoords, setDestinationCoords, setPickup, setDestination, setIsGeocoding }) {
  useMapEvents({
    async click(e) {
      const { lat, lng } = e.latlng;
      setIsGeocoding(true);

      const address = await reverseGeocode(lat, lng);

      if (activeSelection === 'pickup') {
        setPickupCoords([lat, lng]);
        setPickup(address);
      } else {
        setDestinationCoords([lat, lng]);
        setDestination(address);
      }
      setIsGeocoding(false);
    },
  });
  return null;
}

export default function App() {
  const [rides, setRides] = useState([]);
  const [pickup, setPickup] = useState('');
  const [destination, setDestination] = useState('');
  const [seats, setSeats] = useState(2);
  const [loading, setLoading] = useState(true);

  // Map & Geolocation States
  const [pickupCoords, setPickupCoords] = useState(null);
  const [destinationCoords, setDestinationCoords] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [activeSelection, setActiveSelection] = useState('pickup');
  const [geoLoading, setGeoLoading] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);

  const defaultCenter = [12.9716, 77.5946]; // Default map center

  // Track claimed rides locally
  const [claimedRideIds, setClaimedRideIds] = useState(() => {
    const saved = localStorage.getItem('claimed_rides');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    fetchRides();

    const channel = supabase
      .channel('public:flash_carpool_rides')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'flash_carpool_rides' }, (payload) => {
        setRides((prev) => [payload.new, ...prev]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'flash_carpool_rides' }, (payload) => {
        setRides((prev) => prev.map((ride) => (ride.id === payload.new.id ? payload.new : ride)));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('claimed_rides', JSON.stringify(claimedRideIds));
  }, [claimedRideIds]);

  const fetchRides = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('flash_carpool_rides')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error) setRides(data || []);
    setLoading(false);
  };

  // Geolocation Handler with Real Address Lookup
  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }

    setGeoLoading(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const coords = [latitude, longitude];

        setUserLocation(coords);
        setPickupCoords(coords);

        const realAddress = await reverseGeocode(latitude, longitude);
        setPickup(realAddress);

        setGeoLoading(false);
      },
      (error) => {
        setGeoLoading(false);
        alert('Could not access position: ' + error.message);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handlePostRide = async (e) => {
    e.preventDefault();

    const newRide = {
      driver_name: 'Alex (You)',
      pickup_location: pickup,
      destination: destination,
      seats_available: Number(seats),
      departure_time: '15 mins',
    };

    const { error } = await supabase.from('flash_carpool_rides').insert([newRide]);

    if (error) {
      alert('Error posting ride: ' + error.message);
    } else {
      setPickup('');
      setDestination('');
      setPickupCoords(null);
      setDestinationCoords(null);
    }
  };

  const handleClaimSeat = async (rideId, currentSeats) => {
    if (claimedRideIds.includes(rideId)) return;
    if (currentSeats <= 0) return;

    const { error } = await supabase
      .from('flash_carpool_rides')
      .update({ seats_available: currentSeats - 1 })
      .eq('id', rideId);

    if (!error) {
      setClaimedRideIds((prev) => [...prev, rideId]);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 md:p-8 font-sans">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="flex items-center justify-between pb-4 border-b border-slate-800">
          <h1 className="text-2xl font-bold text-emerald-400 flex items-center gap-2">
            <Car className="w-7 h-7" /> FlashCommute
          </h1>
          <span className="text-xs bg-emerald-500/20 text-emerald-300 px-3 py-1 rounded-full font-medium animate-pulse">
            Real Address Mode
          </span>
        </header>

        {/* Map & Controls Section */}
        <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 space-y-3">
          <div className="flex flex-wrap justify-between items-center gap-2 text-xs">
            <button
              type="button"
              onClick={handleUseMyLocation}
              disabled={geoLoading}
              className="flex items-center gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-lg font-medium transition"
            >
              <Navigation className={`w-3.5 h-3.5 ${geoLoading ? 'animate-spin' : ''}`} />
              {geoLoading ? 'Locating...' : 'Use My Current Location'}
            </button>

            <div className="flex items-center gap-2">
              {isGeocoding && (
                <span className="text-slate-400 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin text-emerald-400" /> Finding address...
                </span>
              )}
              <button
                type="button"
                onClick={() => setActiveSelection('pickup')}
                className={`px-3 py-1.5 rounded-lg font-medium transition ${
                  activeSelection === 'pickup' ? 'bg-emerald-500 text-slate-950 font-semibold' : 'bg-slate-700 text-slate-300'
                }`}
              >
                1. Set Pickup Pin
              </button>
              <button
                type="button"
                onClick={() => setActiveSelection('destination')}
                className={`px-3 py-1.5 rounded-lg font-medium transition ${
                  activeSelection === 'destination' ? 'bg-blue-500 text-white font-semibold' : 'bg-slate-700 text-slate-300'
                }`}
              >
                2. Set Destination Pin
              </button>
            </div>
          </div>

          <div className="h-64 rounded-xl overflow-hidden border border-slate-700 relative">
            <MapContainer center={defaultCenter} zoom={13} style={{ height: '100%', width: '100%' }}>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapFlyTo center={userLocation} />
              <MapClickHandler
                activeSelection={activeSelection}
                setPickupCoords={setPickupCoords}
                setDestinationCoords={setDestinationCoords}
                setPickup={setPickup}
                setDestination={setDestination}
                setIsGeocoding={setIsGeocoding}
              />
              {pickupCoords && (
                <Marker position={pickupCoords}>
                  <Popup>{pickup || 'Pickup Location'}</Popup>
                </Marker>
              )}
              {destinationCoords && (
                <Marker position={destinationCoords}>
                  <Popup>{destination || 'Destination'}</Popup>
                </Marker>
              )}
            </MapContainer>
          </div>
        </div>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          
          {/* Post Ride Form */}
          <form onSubmit={handlePostRide} className="bg-slate-800 p-5 rounded-2xl border border-slate-700 space-y-4 md:sticky md:top-8">
            <h2 className="text-base font-semibold text-slate-200 flex items-center gap-2">
              <PlusCircle className="w-5 h-5 text-emerald-400" /> Post Flash Ride
            </h2>

            <div>
              <label className="text-xs text-slate-400 mb-1 block">Pickup Location</label>
              <input
                type="text"
                placeholder="Click map pin or type street address"
                value={pickup}
                onChange={(e) => setPickup(e.target.value)}
                className="w-full bg-slate-900 text-sm p-3 rounded-lg border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                required
              />
            </div>

            <div>
              <label className="text-xs text-slate-400 mb-1 block">Destination</label>
              <input
                type="text"
                placeholder="Click map pin or type street address"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="w-full bg-slate-900 text-sm p-3 rounded-lg border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                required
              />
            </div>

            <div className="flex gap-3">
              <div className="w-1/2">
                <label className="text-xs text-slate-400 mb-1 block">Seats</label>
                <input
                  type="number"
                  min="1"
                  max="6"
                  value={seats}
                  onChange={(e) => setSeats(e.target.value)}
                  className="w-full bg-slate-900 text-sm p-3 rounded-lg border border-slate-700 text-white"
                />
              </div>
              <div className="w-1/2 flex items-end">
                <button type="submit" className="w-full bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-sm rounded-lg py-3 transition">
                  Broadcast
                </button>
              </div>
            </div>
          </form>

          {/* Ride Feed */}
          <div className="md:col-span-2 space-y-4">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Leaving Shortly</h2>
            {loading ? (
              <p className="text-slate-500 text-sm py-8 text-center bg-slate-800/40 rounded-xl">Loading rides...</p>
            ) : rides.length === 0 ? (
              <p className="text-slate-500 text-sm py-8 text-center bg-slate-800/40 rounded-xl">No flash rides posted yet.</p>
            ) : (
              <div className="space-y-3">
                {rides.map((ride) => {
                  const hasClaimed = claimedRideIds.includes(ride.id);
                  const isFull = ride.seats_available <= 0;

                  return (
                    <div key={ride.id} className="bg-slate-800/80 border border-slate-700 p-5 rounded-2xl flex justify-between items-center">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2.5 font-semibold text-white">
                          <MapPin className="w-5 h-5 text-emerald-400 shrink-0" />
                          <span>{ride.pickup_location} → {ride.destination}</span>
                        </div>
                        <div className="flex gap-4 text-xs text-slate-400">
                          <span className="flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5" /> {!isFull ? `${ride.seats_available} seats left` : 'Full'}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5" /> Leaving in {ride.departure_time}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleClaimSeat(ride.id, ride.seats_available)}
                        disabled={hasClaimed || isFull}
                        className={`text-xs px-4 py-2.5 rounded-xl font-semibold flex items-center gap-1.5 transition ${
                          hasClaimed
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 cursor-default'
                            : !isFull
                            ? 'bg-emerald-400/10 hover:bg-emerald-400/20 text-emerald-400 border border-emerald-400/30'
                            : 'bg-slate-700 text-slate-500 border border-slate-600 cursor-not-allowed'
                        }`}
                      >
                        {hasClaimed ? <><CheckCircle className="w-4 h-4" /> Claimed</> : !isFull ? 'Claim Seat' : 'Full'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
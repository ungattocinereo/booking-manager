const PROPERTIES = [
  { id: 'harmony', name: 'Harmony', accent: '#c9512e', listingId: '37988248', icon: 'home' },
  { id: 'royal',   name: 'Royal',   accent: '#1f3d8a', listingId: '973032288955949308', icon: 'crown' },
  { id: 'carina',  name: 'Carina',  accent: '#0b7a7a', listingId: '20551225', icon: 'heart' }
];

const PROPERTY_IDS = PROPERTIES.map(p => p.id);

const AIRBNB_LISTING_MAP = {
  'Suite Harmony Royal. Excellent Central Location': 'royal',
  'Suite Harmony Excellent Central Location': 'harmony',
  '2 Story Suite "Carina" Excellent Central Location': 'carina',
  '2 Story Suite Carina Excellent Central Location': 'carina'
};

const BOOKING_ROOM_MAP = {};

module.exports = { PROPERTIES, PROPERTY_IDS, AIRBNB_LISTING_MAP, BOOKING_ROOM_MAP };

const path = require('node:path');

const CONFIG_PATH = path.join(__dirname, '../../config/reporting-units.json');

function loadReportingUnits() {
  delete require.cache[require.resolve(CONFIG_PATH)];
  const config = require(CONFIG_PATH);
  return (config.units || []).map(unit => {
    const prefix = String(unit.envPrefix || unit.id).toUpperCase();
    const alloggiati = {
      user: process.env[`ALLOGGIATI_${prefix}_USER`] || '',
      password: process.env[`ALLOGGIATI_${prefix}_PASSWORD`] || '',
      wsKey: process.env[`ALLOGGIATI_${prefix}_WSKEY`] || ''
    };
    const istat = {
      cusr: process.env[`ISTAT_${prefix}_CUSR`] || '',
      apiKey: process.env[`ISTAT_${prefix}_API_KEY`] || ''
    };
    return {
      id: unit.id,
      name: unit.name,
      propertyIds: [...new Set(unit.propertyIds || [])],
      envPrefix: prefix,
      alloggiati,
      istat,
      configured: {
        alloggiati: Boolean(alloggiati.user && alloggiati.password && alloggiati.wsKey),
        istat: Boolean(istat.cusr && istat.apiKey),
        mapping: (unit.propertyIds || []).length > 0
      }
    };
  });
}

function publicReportingUnit(unit) {
  return {
    id: unit.id,
    name: unit.name,
    property_ids: unit.propertyIds,
    configured: unit.configured
  };
}

function getReportingUnit(id) {
  return loadReportingUnits().find(unit => unit.id === id) || null;
}

function externalSendEnabled() {
  return ['1', 'true'].includes(String(process.env.REPORTING_EXTERNAL_SEND_ENABLED || '').toLowerCase());
}

module.exports = {
  loadReportingUnits,
  publicReportingUnit,
  getReportingUnit,
  externalSendEnabled
};

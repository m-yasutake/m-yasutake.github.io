'use strict';

/**
 * trip-config.js
 *
 * Single source of truth for which countries/trips this site tracks by a
 * fixed date window. Both fetch-strava-rides.js (stats/<category> docs +
 * assets/stats.json) and generate-pmtiles.js (my-routes-<category>.pmtiles
 * shards) read this list instead of hardcoding a per-country if-chain.
 *
 * To add a new country:
 *   1. Add its lowercase category name to TRIP_COUNTRIES below.
 *   2. Add <COUNTRY>_TRIP_FROM / <COUNTRY>_TRIP_TO to the "env:" blocks in
 *      .github/workflows/fetch-strava-rides.yml and generate-tiles.yml, and
 *      set the corresponding repository variables in GitHub Settings.
 * No other code changes are required in either script.
 */
const TRIP_COUNTRIES = ['japan', 'denmark', 'norway'];

/**
 * Reads the <CATEGORY>_TRIP_FROM / <CATEGORY>_TRIP_TO env vars for a trip
 * category (e.g. 'japan' -> JAPAN_TRIP_FROM/TO). Returns null if
 * <CATEGORY>_TRIP_FROM is not set — an unset trip window means "not tracked
 * this run" rather than an unbounded window. When <CATEGORY>_TRIP_TO is unset
 * the window extends to now (an ongoing/in-progress trip).
 *
 * @returns {{fromMs: number, toMs: number, fromEnv: string, toEnv: string|null}|null}
 */
function getTripWindow(category) {
  const prefix = category.toUpperCase();
  const fromEnv = process.env[`${prefix}_TRIP_FROM`];
  if (!fromEnv) return null;
  const toEnv = process.env[`${prefix}_TRIP_TO`] || null;
  return {
    fromMs: new Date(fromEnv).getTime(),
    toMs: toEnv ? new Date(toEnv).getTime() : Date.now(),
    fromEnv,
    toEnv
  };
}

module.exports = { TRIP_COUNTRIES, getTripWindow };

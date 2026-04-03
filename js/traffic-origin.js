/**
 * Persists a single flag when the landing URL includes Google Ads click identifiers
 * (auto-tagging). Only then do we treat the session as "definitely from Google Ads".
 */

const STORAGE_KEY = 'aa_confirmed_google_ads';
export const TRAFFIC_ORIGIN_GOOGLE_ADS = 'google_ads';

const CLICK_ID_PARAMS = ['gclid', 'gbraid', 'wbraid'];

function landingUrlHasGoogleAdsClickId() {
  try {
    const params = new URLSearchParams(window.location.search);
    for (const p of CLICK_ID_PARAMS) {
      const v = params.get(p);
      if (v != null && String(v).trim() !== '') return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export function captureGoogleAdsTrafficOrigin() {
  if (typeof sessionStorage === 'undefined') return;
  try {
    if (landingUrlHasGoogleAdsClickId()) {
      sessionStorage.setItem(STORAGE_KEY, TRAFFIC_ORIGIN_GOOGLE_ADS);
    }
  } catch {
    /* quota / private mode */
  }
}

/** @returns {'google_ads'|undefined} */
export function getTrafficOriginForSubmit() {
  if (typeof sessionStorage === 'undefined') return undefined;
  try {
    const v = sessionStorage.getItem(STORAGE_KEY);
    if (v === TRAFFIC_ORIGIN_GOOGLE_ADS) return TRAFFIC_ORIGIN_GOOGLE_ADS;
  } catch {
    /* ignore */
  }
  return undefined;
}

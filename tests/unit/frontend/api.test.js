// Typo canary — asserts every MLS-parity api.* method name exists on
// the exported `api` object. If someone renames a method (e.g. drops
// `leadMatches` in favour of `listLeadMatches`), this test breaks
// *before* every dependent page starts throwing at runtime.
//
// Intentionally just shape-checks — no network calls, no MSW. The
// point is to catch name drift across the ~40 methods the MLS UI
// agents depend on.

import { describe, it, expect } from 'vitest';
import { api } from '../../../frontend/src/lib/api.js';

const MLS_API_METHODS = [
  // Office (A1)
  'getOffice',
  'createOffice',
  'updateOffice',
  'addOfficeMember',
  'removeOfficeMember',
  // Tags (A2)
  'listTags',
  'createTag',
  'updateTag',
  'deleteTag',
  'assignTag',
  'unassignTag',
  'listAssignedTags',
  // Reminders (D1)
  'listReminders',
  'createReminder',
  'updateReminder',
  'completeReminder',
  'cancelReminder',
  'deleteReminder',
  // LeadSearchProfile (K4)
  'listLeadSearchProfiles',
  'createLeadSearchProfile',
  'updateLeadSearchProfile',
  'deleteLeadSearchProfile',
  // Matching (C3)
  'leadMatches',
  'propertyMatchingCustomers',
  // Assignees (J10)
  'listPropertyAssignees',
  'addPropertyAssignee',
  'removePropertyAssignee',
  // Adverts (F1)
  'listAdverts',
  'createAdvert',
  'updateAdvert',
  'deleteAdvert',
  // Search (H1)
  'globalSearch',
  // Activity (H3)
  'listActivity',
  // Reports (E1)
  'reportNewProperties',
  'reportNewCustomers',
  'reportDeals',
  'reportViewings',
  'reportMarketingActions',
  'exportUrl',
  // Neighborhoods (G1)
  'listNeighborhoods',
  'createNeighborhood',
  // SavedSearch (B3)
  'listSavedSearches',
  'createSavedSearch',
  'updateSavedSearch',
  'deleteSavedSearch',
  // Favorites (B4)
  'listFavorites',
  'addFavorite',
  'removeFavorite',
];

describe('api client — MLS parity surface', () => {
  it.each(MLS_API_METHODS)('exposes api.%s as a function', (name) => {
    expect(api[name], `api.${name} is missing`).toBeTypeOf('function');
  });

  it('exportUrl returns a CSV URL string (not a fetch)', () => {
    // Unlike every other method on the api object, exportUrl is a
    // URL builder — it must not hit the network. Asserts both "it
    // stayed sync" and "the path matches the backend's route".
    const url = api.exportUrl('properties');
    expect(typeof url).toBe('string');
    expect(url).toMatch(/\/reports\/export\/properties\.csv$/);
  });
});

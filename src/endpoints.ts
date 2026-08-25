/**
 * Endpoint catalog for the AlphaRoute API (`https://api.alpharoute.app`).
 *
 * The AlphaPortal SPA builds every path from a template
 * `{MODULE}/{v1}/{controller}/{action}`; the constants below are the resolved
 * paths, each **live-verified 2026-08-25** against a real signed-in account
 * (except the mutating ones, whose request SHAPES are transcribed verbatim from
 * the web client's bundle — see `docs/ALPHAPORTAL-API.md`). Keeping them in one
 * place means the client's `read()`/`write()` are the only things that build a
 * URL, so auth and error handling can never drift between endpoints.
 */

export const BASE_URL = 'https://api.alpharoute.app';

/**
 * The unauthenticated refresh-token exchange. This is the ONLY call that does
 * not carry a bearer token — it trades the long-lived refresh token for a fresh
 * 30-minute access token. No reCAPTCHA, no MFA (unlike `public/login`, which is
 * reCAPTCHA-gated and therefore not automatable). Verified live.
 */
export const REFRESH_PATH = 'AlphaCore/v1/public/refresh-token';

/** GET/POST read endpoints. `{sid}` = a `studentId`; `{shift}` = 0 (AM) / 1 (PM). */
export const READ = {
  /** POST {} — the signed-in user's profile. */
  profile: 'AlphaCore/v1/user/profile',
  /** GET — account date + timezone (server clock). */
  accountDate: 'AlphaCore/v1/user/accountdate',
  /** GET — account (district) metadata. */
  accountInfo: 'AlphaCore/v1/account/inforetrieve',
  /** GET — the caller's students (full records). */
  studentList: 'AlphaPortal/v1/user-students/list',
  /** GET — slim {originalId, studentName, studentId} list. */
  studentLightList: 'AlphaPortal/v1/user-students/lightlist',
  /** GET `/{sid}` — full student detail (morning/afternoon stops, school). */
  studentRetrieve: 'AlphaPortal/v1/user-students/retrieve',
  /** GET `/{sid}` — the student's assigned bus stops. */
  studentStops: 'AlphaPortal/v1/user-students/stops',
  /** GET `/{sid}/{shift}` — live bus GPS for the run (shift 0=AM, 1=PM). */
  vehicleLocation: 'AlphaPortal/v1/user-students/vehicle-location',
  /** GET — the account groups (districts) the caller belongs to. */
  accountGroups: 'AlphaPortal/v1/user-students/account-groups',
  /** GET `?studentId=<sid>` — a one-time PDF report download link. */
  reportsBulk: 'AlphaPortal/v1/user-students/reports-bulk',
  /** GET — the notifications feed (arrival/departure alerts). */
  notificationsList: 'AlphaPortal/v1/notifications/list',
  /** GET — portal feature/visibility settings. */
  applicationSetting: 'AlphaPortal/v1/applicationsetting/retrieve',
  /** GET — all schools in the district (name, lat/lng). */
  schoolLightList: 'AlphaPlan/v1/school/lightlist',
  /** GET — grade list. */
  gradeList: 'AlphaPlan/v1/student/gradelist',
  /** GET — distance units. */
  distanceUnitList: 'AlphaPlan/v1/distanceunit/list',
  /** GET — the caller's submitted transportation requests (tracking numbers). */
  requestList: 'AlphaPortal/v1/requests/list',
} as const;

/**
 * Mutating endpoints. Bodies are transcribed from the web client (see
 * `docs/ALPHAPORTAL-API.md`); every one is confirm-gated in its tool.
 */
export const WRITE = {
  /** POST — set one student's notification preferences. */
  setNotification: 'AlphaPortal/v1/user-students/setnotification',
  /** POST — set notification preferences for all students at once. */
  setNotificationBulk: 'AlphaPortal/v1/user-students/setnotification-bulk',
  /** POST — edit a student's walk-zone radius (meters). */
  radiusEdit: 'AlphaPortal/v1/user-students/radius-edit',
  /**
   * POST — validate a transportation request without submitting it. This one is
   * non-mutating and live-verified (returns eligibility lists); it is still
   * confirm-gated for consistency but safe to run.
   */
  transportValidation: 'AlphaPortal/v1/requests/transportation/validation',
  /** POST — submit a transportation request. */
  transportAdd: 'AlphaPortal/v1/requests/transportation/add',
  /** POST — submit an alternative-stop request. */
  alternativeAdd: 'AlphaPortal/v1/requests/alternative/add',
} as const;

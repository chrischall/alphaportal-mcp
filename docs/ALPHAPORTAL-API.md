# AlphaPortal / AlphaRoute API notes

Reverse-engineered from the `cmsnc.alphaportal.app` Angular SPA and **verified
live against a real signed-in account on 2026-08-25**. This is the reference for
every path and shape the server encodes. Reads are all live-verified; write
**bodies** are transcribed verbatim from the web client bundle (the sanctioned
"derive from the reference client" approach) and are confirm-gated — see the per
-endpoint notes.

- **Base:** `https://api.alpharoute.app`
- **Path template:** `{MODULE}/{v1}/{controller}/{action}` — the module defaults
  to `AlphaPortal` when the client sets none; `AlphaCore` and `AlphaPlan` are set
  explicitly on some calls.
- **Envelope:** `{ success: boolean, data: T, message: string }` (a few legacy
  endpoints order the keys `{ message, data, success }`; `success:false` also
  carries `developerMessage: string[]`).
- **Auth:** `Authorization: Bearer <accessToken>` on everything except the
  refresh exchange. The server accepts the raw token too, but we send `Bearer `.

## Authentication — refresh-token, not username/password

`AlphaCore/v1/public/login` requires a `recaptcha` **header** (a reCAPTCHA v3
token minted in the browser), so username/password login **cannot** be driven
server-side. The automatable credential is the **refresh token**:

- The SPA stores it in `localStorage.user` → `.User.RefreshToken` (an 8-day JWT).
- Access tokens are 30-minute JWTs (`localStorage.user.Token`).
- `POST AlphaCore/v1/public/refresh-token` with `{ "refreshToken": "<jwt>" }`
  returns `{ data: { token, refreshToken, lang } }` — **no reCAPTCHA, no MFA.**
- The refresh token is **stateless and reusable**: the server validates the JWT
  signature + `exp` and does not track consumption, so an already-used refresh
  token keeps working until its own `exp`. Every refresh also issues a fresh
  8-day refresh token; persisting it rolls the window forward.

Implication: capture the refresh token once from a signed-in tab; thereafter the
server runs entirely with `curl`/`node-fetch`. No browser bridge at runtime.

## Reads (all live-verified 2026-08-25)

`{sid}` = a numeric `studentId`; `{shift}` = `0` (AM, to school) / `1` (PM, home).

| Path | Method | Notes |
| --- | --- | --- |
| `AlphaCore/v1/user/profile` | POST `{}` | `data.Profile` |
| `AlphaCore/v1/user/accountdate` | GET | `data.{TimeZone,SecOfDay,Date}` |
| `AlphaCore/v1/account/inforetrieve` | GET | `data.Account` |
| `AlphaPortal/v1/user-students/list` | GET | `data.students[]` (name, studentId, originalId, gradeName, hasTransportation…) |
| `AlphaPortal/v1/user-students/lightlist` | GET | slim `data.students[]` |
| `AlphaPortal/v1/user-students/retrieve/{sid}` | GET | `data.{studentName, morningStops[], afternoonStops[], schoolInfo}` |
| `AlphaPortal/v1/user-students/stops/{sid}` | GET | `data.stops[]` (time, stopName, saLat/saLng, vehicleName, calendar[]) |
| `AlphaPortal/v1/user-students/vehicle-location/{sid}/{shift}` | GET | `data.location.{lat,lng,speed,time,vehicleId,vehicleOriginalID}` — live bus GPS; empty when not running |
| `AlphaPortal/v1/user-students/account-groups` | GET | `data.accountGroups[]` |
| `AlphaPortal/v1/user-students/reports-bulk?studentId={sid}` | GET | a one-time PDF report link |
| `AlphaPortal/v1/notifications/list` | GET | `data.notifications[]` (id, personName, title, body, creationDate) — the real feed. NB: `user-students/notification/list` is a DIFFERENT route that reads the path segment as a studentId and is not what the web app uses. |
| `AlphaPortal/v1/applicationsetting/retrieve` | GET | `data.settings` (feature/visibility flags) |
| `AlphaPortal/v1/requests/list` | GET | `data.requestTransportations[]` (trackingNumber, status) |
| `AlphaPlan/v1/school/lightlist` | GET | `data.School[]` (ShortName, SchoolName, Lat, Lng) |
| `AlphaPlan/v1/student/gradelist` | GET | `data.Grades[]` |
| `AlphaPlan/v1/distanceunit/list` | GET | `data.Units[]` |

Sample verified `vehicle-location` payload:

```json
{"success":true,"data":{"location":{"lat":35.169721,"lng":-80.867264,"time":31997,"speed":"36.33","vehicleOriginalID":"M529","vehicleId":3889871}},"message":""}
```

## Writes (confirm-gated; bodies transcribed from the web client)

Both shipped writes route through the client's single `write()` and are gated by
`confirm: true` (a dry-run of the exact payload is returned otherwise).

### `AlphaPortal/v1/user-students/radius-edit` — POST

Body `{ studentId: <int>, radius: <int, meters> }`. **Live-verified that
`studentId` and `radius` are required** (a body missing them returns
`400 "studentId: must not be null"`). Changes a student's walk-zone radius,
which can affect eligibility.

### `AlphaPortal/v1/user-students/setnotification` — POST

Body `{ studentId, studentOriginalId?, <category><Notify|Email><Am|Pm>: 0|1, … }`.
Live-verified that `studentId` is required. Categories (from the client, gated on
the district's `applicationsetting` flags): `stopRadiusEntry`, `studentScan`,
`backupBus`, `schoolArrival`, `stopServiced`. `setnotification-bulk` is the same
body without `studentOriginalId`. The web client sends the whole preference set
at once (read-modify-write of the form), so a partial body may leave omitted
categories unchanged or reset them — the dry-run shows exactly what is sent.

## Not yet implemented (known gap)

The transportation-request family — `AlphaPortal/v1/requests/transportation/add`,
`.../transportation/validation`, `.../alternative/add` — has complex nested
bodies (`addressText`, `zipCode`, `studentsInfo`, `stopCalendar[]`, and a
`transportreqJson` string of a `studentArray`) that were **not** fully captured.
`transportation/validation` is non-mutating and returns
`{NotRelevantList, NotTrueDataList, TriedBeforeList, EligibleList}` for an empty
body, but its useful input shape is unverified. These are deliberately omitted
rather than shipped as guessed payloads; add them once captured from a live
submit.

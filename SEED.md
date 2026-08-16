# Seed Data

Run `npm run seed` (wipes and recreates all data). Password for **all** users: `Passw0rd!`

## Users (one per role)

| Username | Role | Scope |
|----------|------|-------|
| `dataentry` | Data Entry | Both report types · RYD01 + JED01 |
| `checker` | Checker | Both report types · RYD01 + JED01 |
| `sysmanager` | System Manager | Both report types · RYD01 + JED01 |
| `sysadmin` | System Administration Manager | Both report types · ALL facilities (implicit) |
| `builder` | Report Builder | — |
| `operations` | Operations | — |

Facility `DMM01` is deliberately outside the scoped users' assignments, to demonstrate scope
enforcement (DoD §4).

## Facilities

| Code | Name | City |
|------|------|------|
| RYD01 | Riyadh Central Medical Center — مركز الرياض الطبي المركزي | Riyadh |
| JED01 | Jeddah Occupational Health Clinic — عيادة جدة للصحة المهنية | Jeddah |
| DMM01 | Dammam Medical Complex — مجمع الدمام الطبي | Dammam |

## Entities

| Code | Channels | Config |
|------|----------|--------|
| SIM-PUSH — Simulator Push Entity | Push | Webhook `http://localhost:4000/api/simulator/webhook`, secret header `sim-secret-123` |
| MOH-PULL — Ministry Inquiry Entity | Pull | Client ID `ent_moh_pull_demo` · Client Secret `pull-demo-secret-12345` (stored hashed; regenerate via Operations → Entities) |

MOH-PULL's pull scope covers both report types (but template settings only share type 1 via Pull).

## Published templates

1. **Pre-Employment Medical Examination — الفحص الطبي لما قبل التوظيف** (v1, Published)
   - Validity **90 days**, duplicate prevention **ON**
   - Sharing: SIM-PUSH (Push) + MOH-PULL (Pull)
2. **Periodic Fitness Examination — فحص اللياقة الدوري** (v1, Published)
   - No validity, duplicate prevention OFF, **no sharing** (internal only — BR-T6)

Both have bilingual sections: General Examination (height, weight, blood pressure, pulse),
Laboratory Results (repeating table), Radiology (with conditional notes when X-Ray = Abnormal),
Final Result (Fit/Unfit with conditional "Unfit Reason").

## Sample reports

| # | Number | State | Notes |
|---|--------|-------|-------|
| 1 | — (draft) | Draft | Pre-Employment, partial data |
| 2 | RPT-YYYY-000001 | Submitted | Periodic Fitness, awaiting checker |
| 3 | RPT-YYYY-000002 | Returned for Correction | with checker remarks |
| 4 | RPT-YYYY-000003 | Rejected | terminal, with reason |
| 5 | RPT-YYYY-000004 | Approved | pushed to SIM-PUSH (logged), pull-visible to MOH-PULL |
| 6 | RPT-YYYY-000005 | Cancelled | was approved + pushed; cancellation push logged |
| 7 | RPT-YYYY-000006 | Approved (Expired) | approved 100 days ago, 90-day validity |

`YYYY` is the current year at seed time.

## Quick demo commands

```bash
# Pull inquiry (entity credentials above)
curl -u "ent_moh_pull_demo:pull-demo-secret-12345" \
  "http://localhost:4000/api/external/v1/reports?reportNumber=RPT-$(date +%Y)-000004"

# Full end-to-end check (server must be running on a fresh seed)
node server/scripts/e2e.mjs
```

# SPEC — Income Calculator: SUBSALE (+ PRIMARY) — extracted from production code

**Status:** Extracted 2026-08-02 from the live MY (ren) Warriors app.
**Authoritative source files (newest, production, all byte-identical across copies):**

| File | Role |
|---|---|
| `C:\Users\User\kamal\ren-warriors\js\income-config.js` | ALL constants/tables (AGC_CONFIG) |
| `C:\Users\User\kamal\ren-warriors\js\income-calc.js` | Pure calculation logic (window.AGC) |
| `C:\Users\User\kamal\ren-warriors\js\income-app.js` | UI/DOM layer (IncomeApp) |
| `C:\Users\User\kamal\ren-warriors\js\modules\m11.js` | Screen HTML (inputs, defaults) |
| `C:\Users\User\kamal\ren-warriors\lang\en.json` (lines 467–526) | UI labels (EN; `bm.json` mirrors) |

Identical copies exist in `kamal\indo-app\js\`, `kamal\ren-port\js\`, `kamal\agent-indo-30062026\js\` (same size/content, June 21 2026 builds). The standalone `kamal\ag-income-calculator\js\{config.js,calc.js,app.js}` is an **older** version — its `defaultSstMode` is `'deduct'` (net = amt × 0.92) and it lacks the `'clientpaid'` mode. **The ren-warriors version is authoritative**; the deduct mode is explicitly commented `legacy, over-deducts` (`income-config.js:44`).

All percentages in code are decimals (`0.65` = 65%). Currency is `RM` (MY).

---

## A. Constants & tables (from `income-config.js`)

### A1. Global / SST (`income-config.js:34–45`)

| Constant | Value | Meaning |
|---|---|---|
| `currency` | `'RM'` | display currency |
| `sstRate` | `0.08` | Malaysian SST 8% |
| `defaultSstMode` | `'inclusive'` | absorb-SST math used when the client does NOT pay SST |

SST modes implemented in `applySst()` (`income-calc.js:29–45`):

| Mode | Formula | Use |
|---|---|---|
| `'clientpaid'` | `net = amount` | UI tickbox ON — "SST paid by client (8% added on top)"; agent keeps full amount (`income-calc.js:30–34`) |
| `'inclusive'` (default) | `net = amount / (1 + sstRate)` = `amt / 1.08` | tickbox OFF — SST absorbed. Because 8% SST is 8% of the NET fee, net = gross ÷ 1.08 (`income-calc.js:42–44`) |
| `'deduct'` | `net = amount * (1 - sstRate)` = `amt × 0.92` | LEGACY only, over-deducts (`income-calc.js:38–41`). Do not use in super-app. |
| `'exclusive'` | `gross = amount * (1 + sstRate)` | add-8%-on-top display helper (`income-calc.js:35–37`) |

UI wiring (`income-app.js:24–43`): checkbox `#agc-sst-clientpaid` → `getSstMode()` returns `'clientpaid'` when ticked, else `CFG.defaultSstMode` (`'inclusive'`). SUBSALE only. **PRIMARY always uses the absorbed mode** and ignores the tickbox (`income-app.js:34–36`, `getPrimarySstMode()`).

Labels (`en.json:497–499`):
- tickbox: "SST paid by client (8% added on top)"
- ticked note: "Client pays the 8% SST — you keep the full commission."
- unticked note: "8% SST absorbed from the commission (net = amount ÷ 1.08)."

### A2. SUBSALE rank ladder (`income-config.js:50–61`)

Rule: **total payout % = baseRate + rank add-on**. `baseRate = 0.40` (40%, editable base for every REN).

| # | Rank | Accumulated sales target (RM) | Add-on | **Total payout %** |
|---|---|---|---|---|
| 1 | TROOPER | 0 (start) | 20% | **60%** |
| 2 | VALIANT | 10,000 | 25% | **65%** |
| 3 | CONSTABLE | 20,000 | 30% | **70%** |
| 4 | CORPORAL | 40,000 | 35% | **75%** |
| 5 | SERGEANT | 100,000 | 40% | **80%** |
| 6 | LIEUTENANT | 200,000 | 45% | **85%** |
| 7 | COMMANDER | 250,000 | 48% | **88%** |
| 8 | GENERAL | 275,000 | 50% | **90%** |

- The "targets" are **accumulated sales needed to hold the rank**, not cash bonuses (`income-config.js:95–97`).
- Rank resolution by accumulated sales = highest rung whose `target <= accumulated` (`income-calc.js:52–62`, `resolveRankByAccumulated`).
- Rank-name → rate lookup: `rateForRank` (`income-calc.js:65–70`); unknown name falls back to rung 0 (TROOPER).
- UI wording for the note under the tier picker (`income-app.js:172–174`): `"Selling REN total payout = VALIANT · 65% (base 40% + add-on 25%)"`.

### A3. Agency commission

- `defaultAgencyRate: 0.02` in config (`income-config.js:63`) — but the **production screen defaults the input to 3** (`m11.js:36`: `id="agc-agency-rate" min="0" step="0.1" value="3"`).
- **No hard max is enforced in code.** MY legal/board max is 3% for subsale — the super-app must enforce this as an admin-configurable per-country max (see §D).
- Default property price input: `500,000` (`m11.js:34`).

### A4. Override (OV) (`income-config.js:65–71`)

```
override: { minRate: 0.80, cap: 0.25 }
```

- **OV is paid ONLY to L1 (the direct leader). L2/L3/L4 NEVER receive OV** (`income-config.js:66–67`, enforced at `income-calc.js:95`, `if (i === 0 && L.exists)`).
- L1 must have rate **≥ 80%** (`minRate`) to earn OV at all.
- `OV% = clamp(L1.rate − sellingRate, 0, 0.25)` — capped at **25 percentage points** (`income-calc.js:97`).

### A5. RGR — "REN GET REN" (`income-config.js:73–88`)

```
rgr: {
  highBandMinRate: 0.88,
  standard: [0.05, 0.03, 0.02, 0.02],   // L1 5%, L2 3%, L3 2%, L4 2%
  high:     [0.03, 0.02, 0.01, 0.01],   // L1 3%, L2 2%, L3 1%, L4 1%
}
```

- Scheme auto-chosen by the **SELLING REN's** rate (`income-calc.js:114`): `sellingRate >= 0.88 → high, else standard`. (Ladder jumps 85% → 88%, so nothing sits between; UI shows "RGR scheme: 5 / 3 / 2 / 2 (selling REN ≤ 85%)" vs "3 / 2 / 1 / 1 (selling REN 88–90%)" — `income-app.js:191–194`.)
- **RGR is ALWAYS paid for all 4 tiers.** If a layer has no agent, that tier's RGR **goes to the COMPANY** (`toCompany: true`) and still counts toward the combined cap (`income-config.js:80–81`, `income-calc.js:117`). The breakdown table labels the summed row "Company (forfeited RGR)" (`income-app.js:260`).
- Index 0 = L1 (direct leader), 1 = L2, 2 = L3, 3 = L4.

### A6. Combined cap (`income-config.js:90–93`)

```
combinedCap: 0.97   // 97%
```

`sellingRate + Σ OV + Σ RGR ≤ 97%`. Excess is **trimmed from OV only, direct layer (L1) first, walking up**; RGR is protected (`income-calc.js:130–152`, `applyCombinedCap`). UI notice when applied (`income-app.js:231–237`): "⚠ Combined cap applied: −X% trimmed from L1 OV (total A% → B%, max 97%)."

### A7. PRIMARY constants (`income-config.js:99–123`)

| Constant | Value | Meaning |
|---|---|---|
| `primary.tlFactorOfHot` | `0.50` | TL% = 50% × HOT% |
| `primary.lFactorOfHot` | `0.30` | L% = 30% × HOT% |
| `primary.sharePoolLayers` | `['IQI','VP','HOT']` | who funds the TL+L cost, equal split |
| `primary.passwords` | cyrb53 hashes of `vp-warriors-2026` / `hot-warriors-2026` | **standalone-app relic only**; production uses the logged-in user's `careerRank` from the session, no password (`income-app.js:301–307`) |
| `primary.sample` | `{ price: 350000, renPct: 0.02, hotPct: 0.0273, vpPct: 0.0073 }` | ERINAZ worksheet sample |

Production project seed (`income-app.js:322–328`, `PROJECT_SEED`): Erinaz Suites — price 350,000, REN 2%, VP pool 0.73%, HOT 0.40%, HOT+TL on, plus an optional **per-project RGR bonus** (`rgrOn`, `rgrPct` default 1%, `rgrFrom`/`rgrTo` validity dates, T&C text).

### A8. Subsale chain defaults (`income-app.js:46–51`, `CHAIN_LAYERS`)

| Layer | Default name | Default rank | Default ticked |
|---|---|---|---|
| L1 — Direct leader | "Direct leader" | SERGEANT (80%) | ON |
| L2 — Leader 2 | "Leader 2" | GENERAL (90%) | ON |
| L3 — Leader 3 | "Leader 3" | GENERAL (90%) | OFF |
| L4 — Leader 4 | "Leader 4" | GENERAL (90%) | OFF |

Selling-REN rank dropdown defaults to **VALIANT** (`income-app.js:71`). These defaults are exactly the worked example in §C.

---

## B. Exact formulas (quoted from code)

### B1. Selling rate resolution (`income-app.js:74–82`)

Custom % (if entered) **overrides** the picked rank:

```js
function getSellingRate() {
  if (isCustomRate()) return parseFloat($('#agc-custom-rate').value) / 100;
  return AGC.rateForRank($('#agc-rank').value, CFG.rankLadder, CFG.baseRate);
}
```

### B2. Gross commission pool (`income-calc.js:182–183`)

```js
// Gross agency commission pool. All payout %s are a share of THIS.
var grossComm = price * agencyRate;
```

**Every payout % (selling, OV, RGR) is a percentage of `grossComm`, never of the price.**

### B3. OV (`income-calc.js:85–103`, `computeOverrides`)

```js
if (i === 0 && L.exists) {                 // ONLY the direct (1st) layer
  eligible = L.rate >= minRate;            // must be >= 80% to override
  if (eligible) ov = clamp(L.rate - sellingRate, 0, cap);   // cap = 0.25
}
```

### B4. RGR (`income-calc.js:113–120`, `computeRgr`)

```js
var table = sellingRate >= rgrCfg.highBandMinRate ? rgrCfg.high : rgrCfg.standard;
for (var i = 0; i < uplines.length; i++) {
  out.push({ rgr: table[i] || 0, toCompany: !uplines[i].exists });
}
```

### B5. Combined cap (`income-calc.js:130–152`, `applyCombinedCap`)

```js
var totalBefore = sellingRate + sum(work.map(l => l.ov + l.rgr));
if (totalBefore > cap) {                     // cap = 0.97
  var excess = totalBefore - cap;
  for (var i = 0; i < work.length && excess > 1e-12; i++) {  // direct first
    var cut = Math.min(work[i].ov, excess);
    work[i].ov -= cut; excess -= cut; trimmed += cut;
  }
}
```

### B6. Money rows (`income-calc.js:196–228`, inside `calcSubsale`)

```js
var ovAmount   = grossComm * ovPct;         // capped OV
var rgrAmount  = grossComm * rgrPct;
var agentPct   = L.exists ? (ovPct + rgrPct) : 0;   // layer take-home %
var agentAmount = grossComm * agentPct;
if (toCompany) companyRgrAmount += rgrAmount;       // empty layer -> company
...
var sellingAmount = grossComm * sellingRate;        // income-calc.js:228
```

Every amount is emitted both gross and after-SST via `applySst(amount, sstMode, sstRate)` (fields `ovSst`, `rgrSst`, `agentSst`, `sellingSst`, `grossCommSst`, `company.sst`).

### B7. SST (`income-calc.js:29–45`, `applySst`) — see table in §A1. Displayed take-homes use `.afterSst`.

### B8. Full breakdown table columns (`income-app.js:239–274`, `m11.js` + `en.json:492–496`)

Columns: **Party | Rate | OV | RGR | RM (gross) | RM (after 8% SST)**. Rows: Selling REN (highlighted), L1–L4 (empty layer shown as "— (Ln → Company)" with its RGR % and RM), then "Company (forfeited RGR)" summary row when > 0. Rank-ladder card lists all 8 ranks with `Acc. RM target` + total % (`income-app.js:277–291`). Save/Print = `window.print()` (`income-app.js:750–751`).

---

## C. Worked example — verified against the formulas step by step

Inputs (= the production screen defaults): price **RM 500,000**, agency rate **3%**, SST tickbox **OFF** (mode `'inclusive'`, ÷ 1.08), selling REN **VALIANT**, chain L1 **SERGEANT** ON, L2 **GENERAL** ON, L3 OFF, L4 OFF.

1. **Selling rate** = base 0.40 + VALIANT add-on 0.25 = **0.65**.
2. **Gross pool**: `grossComm = 500,000 × 0.03 = RM 15,000`.
3. **RGR scheme**: 0.65 < 0.88 → **standard 5/3/2/2**.
4. **OV**: L1 exists, rate 0.80 ≥ 0.80 → eligible. `OV = clamp(0.80 − 0.65, 0, 0.25) = 0.15`. L2–L4: OV = 0 (L1 only).
5. **Combined cap check**: 0.65 + 0.15 + (0.05+0.03+0.02+0.02) = **0.92 ≤ 0.97** → no trim.
6. Money (gross → ÷1.08):

| Party | Rate | OV % | RGR % | Gross RM | After-SST RM |
|---|---|---|---|---|---|
| Selling REN | 65% | — | — | 15,000 × 0.65 = 9,750.00 | **9,027.78** ✓ |
| L1 SERGEANT | 80% | 15% | 5% | OV 2,250.00 / RGR 750.00 / total 3,000.00 | OV **2,083.33** ✓ · RGR **694.44** ✓ · take-home **2,777.78** ✓ |
| L2 GENERAL | 90% | 0% (L1 only) | 3% | 450.00 | **416.67** ✓ |
| L3 — (→ Company) | — | 0% | 2% | 300.00 | **277.78** → Company ✓ |
| L4 — (→ Company) | — | 0% | 2% | 300.00 | **277.78** → Company ✓ |
| Company (forfeited RGR) | — | — | — | 600.00 | **555.56** ✓ |

All six target figures (9,027.78 / 2,083.33 / 694.44 / 2,777.78 / 416.67 / 555.56) reproduce exactly. (Recomputed numerically 2026-08-02; e.g. 9,750 ÷ 1.08 = 9,027.777… → 9,027.78.)

With SST tickbox **ON** (`'clientpaid'`), the after-SST column equals the gross column (selling REN keeps RM 9,750.00, etc.).

---

## D. Admin-configurable parameters (per country, in super-app settings)

Everything below is a plain number/table in `AGC_CONFIG` today; the super-app must move them to per-country admin settings (MY = ren base, ID = agen). Defaults = current MY production values.

| Setting | MY default | ID note |
|---|---|---|
| Currency symbol | `RM` | `Rp` for ID |
| SST/tax rate | `0.08` (8%) | ID uses PPN — rate & label configurable; allow 0/disabled |
| Default SST mode | `'inclusive'` (÷ 1.08) | keep `'clientpaid'` toggle; hide `'deduct'`/`'exclusive'` (legacy) |
| Base rate | `0.40` | editable |
| Rank ladder (name, accumulated target, add-on) × 8 rows | table in §A2 | fully editable rows (add/remove/re-order); ID may have its own ladder |
| Default agency commission % | UI default `3` (config `defaultAgencyRate: 0.02` unused by the screen) | editable |
| **Agency commission max %** | **3% (MY board max)** — NOT enforced in current code; must be enforced as input max | **6% for ID** |
| OV `minRate` | `0.80` | editable |
| OV `cap` | `0.25` (25 pts) | editable |
| OV recipients | L1 only (hard rule) | keep as rule; optionally a "number of OV layers" setting defaulting to 1 |
| RGR `highBandMinRate` | `0.88` | editable |
| RGR standard table | `[5%, 3%, 2%, 2%]` | editable, 4 tiers |
| RGR high table | `[3%, 2%, 1%, 1%]` | editable, 4 tiers |
| RGR empty-layer destination | Company | fixed rule (display label editable) |
| Combined cap | `0.97` | editable |
| Cap trim order | OV first, L1 upward; RGR protected | fixed rule |
| Chain depth | 4 layers | editable (1–4+) |
| Chain layer defaults (name/rank/on) | §A8 | editable |
| PRIMARY `tlFactorOfHot` | `0.50` | editable |
| PRIMARY `lFactorOfHot` | `0.30` | editable |
| PRIMARY funders pool | IQI + VP always, HOT if present (÷3 / ÷2) | fixed rule |
| PRIMARY project list (name, price, REN%, VP pool %, HOT%, ticks, RGR bonus %/dates/T&C) | seed §A7 | per-country shared data, editable by VP/HOT roles |
| Role visibility matrix (which columns each careerRank sees) | §E4 | configurable if needed |

---

## E. PRIMARY (project) mode spec

Source: `calcPrimaryScenario` (`income-calc.js:277–337`) + UI (`income-app.js:293–701`). Confirmed in code comments against the ERINAZ worksheet, "matches all 5 scenarios" (`income-calc.js:266`).

### E1. Inputs (all % OF UNIT PRICE, entered by VP/HOT)

`price`, `renPct` (e.g. 0.02), `vpPoolPct` = **(A)** VP+HOT leadership pool (e.g. 0.0073), `hotPct` = **(B)** HOT's % carved from the pool (e.g. 0.0040), booleans `hotPresent`, `tlPresent`, `lPresent`. SST mode is **always** the absorbed default (÷ 1.08) — the client-paid tickbox does not apply to PRIMARY (`income-app.js:34–36, 539`).

### E2. Formulas (`income-calc.js:283–321`)

```
TL% (D) = tlPresent ? 0.50 × B : 0
L%  (E) = lPresent  ? 0.30 × B : 0
cost    = D + E
funders = 2 + (hotPresent ? 1 : 0)        // IQI + VP always; HOT if ticked
share   = cost > 0 ? cost / funders : 0   // ÷3 with HOT, ÷2 without
VP base = hotPresent ? (A − B) : A
VP final  = VPbase − share
HOT final = hotPresent ? (B − share) : 0
IQI       = cost > 0 ? −share : 0         // company contribution (negative)
REN, TL, L are paid their own % of price.  amount = price × pct;  net = amount ÷ 1.08
```

`totalPct = renPct + vpFinal + hotFinal + tlPct + lPct + iqiPct` (`income-calc.js:321`). "Always-on" motivational TL/L values (50%/30% of B even when unticked) are also returned as `alwaysTl`/`alwaysL` (`income-calc.js:330–332`) so those table columns never read blank.

### E3. PRIMARY per-project RGR bonus (different from subsale RGR)

Per project: `rgrOn`, `rgrPct` (default 1, % of **unit price**), `rgrFrom`/`rgrTo` validity dates, free-text T&C (`income-app.js:322–328, 366–378`). Net = `applySst(price × rgrPct/100, absorbed, 0.08).afterSst` (`income-app.js:669–674`). Paid **ONLY to the direct leader (L role) who recruited the selling REN — never to the selling REN** (`income-app.js:636–644`, `en.json:510`). Status badge: active / upcoming / expired by today's date vs the validity window (`income-app.js:689–692`). An "I recruited this REN" tick (visible to L only, when the selected project has RGR) adds the bonus to the hero take-home and the units-to-target math.

### E4. Roles & gating (`income-app.js:301–307, 517–537, 566–574`)

Role = logged-in user's `careerRank` (`ren|l|tl|hot|vp`; anything else → `ren`, least privilege). No passwords in production. Edit rights: HOT & VP edit projects/commission; **VP pool % is VP-only (hidden from HOT; server also strips it)**. Column visibility: ren/l/tl see `ren, rgr, l, tl, hot`; hot sees `ren, rgr, hot, tl, l`; vp sees all incl. `vp`. Read-only note for others: "🔒 Commission & structure may change from time to time according to incentives by IQI." Target feature: "Target income (RM)" → `units = ceil(target / perUnitAfterSst)` per project (`income-calc.js:341–344`, `unitsForTarget`; null when per-unit ≤ 0). Projects + target are saved shared via proxy `incomeGet`/`incomeSave` (HOT/VP only; `income-app.js:427–495`).

---

## F. Implementation notes for the super-app

1. Keep the calc layer **pure and framework-free** exactly as `income-calc.js` — it already runs in Node for unit tests (`module.exports`, `income-calc.js:361–363`).
2. Replace `AGC_CONFIG` constants with a per-country settings record (§D) fetched from Supabase; retain the same field names for a 1:1 port.
3. Enforce agency-rate max at input level (MY 3, ID 6) — currently only `min="0"` exists (`m11.js:36`).
4. Drop `'deduct'`/`'exclusive'` SST modes and the standalone password gate; keep `'inclusive'` + `'clientpaid'` and careerRank-based gating.
5. Unit-test fixture: the §C example (six exact figures) plus a cap-trigger case (e.g. selling 85% custom, L1 90%: 0.85+0.05+0.12 RGR… verify trim comes off L1 OV only) and a `clientpaid` case (net == gross).

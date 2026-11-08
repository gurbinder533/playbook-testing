# Clear to Pick (CTP) Ship Readiness — KPI & Transformation Documentation

Covers the four tabs of the app: **Summary**, **Equipment revenue**, **Order Holds**, and the supporting **Order grid / Allocation / Line view** drill-downs.
Source of truth: the pipeline *Clear to Pick Report* (action ids in brackets) and the page code in this bundle. Quarter used today: **Q4 2026 (2026-10-01 to 2027-01-01)**.

---

## 1. End-to-end data flow

```
Oracle EBS CSV extracts (CTP_files_11_02_26)
  └─ stack_parquet → one table per CSV (order headers, order lines, holds, on-hand, reservations, POs, deliveries, customers, items…)
       ├─ Header holds / Line holds (active, concatenated)       [449583, 449584, 449586, 449593]
       ├─ Order lines enriched (base)  → Order_Lines              [449598 → 449600]   ← the line-level “fact” table
       ├─ Allocation engine (supply vs demand)                    [449606, 449590, 449587, 449592, 449609 → 449610]
       ├─ Sales Order Ship Readiness (per order)                  [449616]            ← Summary tab
       └─ Equipment-revenue dashboard + lines + regions           [449638, 449621, 449618] ← Equipment revenue & Order Holds tabs
```

### 1.1 Order_Lines [449598 → 449600]
One row per sales-order line, enriched with header (customer PO, currency, FX rate, order type), operating unit, ship-to country, item master, product category, delivery status and **HOLDS**.

| Field | Definition |
|---|---|
| **FULFILL_METHOD** | `Container` if item type starts MODEL / PTO-KIT or = AI. `Software` if item type starts SW or SOFTWARE (but not SW-OEM). `Equipment` if the item is inventory + stock-enabled + transactable + shippable + purchasable and not software. Otherwise `Fulfill-Only` (services, freight, adjustments…). “Option class” parents are dropped. |
| **DEMAND_QTY** | max(ordered qty − shipped qty, 0) |
| **REMAINING_VALUE_USD** | DEMAND_QTY × unit selling price × USD rate (rate = 1 for USD, else the order’s GL conversion rate) |
| **IS_OPEN_DEMAND** | False for return / RMA / internal / ISO orders and for cancelled or closed lines; true otherwise |
| **CONTAINER_REVENUE_ROLLUP** | For a priced model/kit parent: `Equipment` if any child line of the same order line number is Equipment, else `Software` if any child is Software. This is how kit value is attributed to equipment or software. |
| **HOLDS** | Active header holds + active line holds, comma-separated. Header holds = unreleased rows (not released, no release id/date) on the order header. Line holds come from the line-hold extracts (current + 2021 file). |

### 1.2 Allocation engine [449606–449610] (the “Clear to Pick” logic)
Every **open equipment line** is matched to supply, quantity by quantity, in this fixed order. `Allocated qty = MIN(remaining demand, supply quantity)`. A line split over several supplies gets several rows (**Sub No**).

| # | Line stage | Supply used | Ship-ready date |
|---|---|---|---|
| 1 | 00-Reserved OH | on-hand already reserved to the line | today |
| 2 | 00-Reserved CL PO | reserved to a PO that is already closed/received | reservation date |
| 3 | 00-Reserved PO | reserved to an open PO or internal sales order | PO promised date |
| 4 | Reserve to OH | un-reserved on-hand: locators that name the order (or a PO naming the order) first, then other on-hand by **order priority** | today |
| 5 | Reserve to PO | open PO supply: POs whose comment names the order first, then remaining POs by order priority | PO promised date (else need-by, else end of current week) |
| 6 | 7-PO to place | a requisition is reserved but the PO is not yet placed | lead-time date |
| 7 | Buy | no stock or PO left | lead-time date |

* **Supply netting:** on-hand excludes sub-inventories containing SHIP, MRB or DROP and is net of reservations; open PO supply = ordered − received − cancelled − reserved, excluding cancelled/closed POs.
* **Order priority:** fewest still-short lines first, then earliest promise date.
* **Lead-time date:** today (next business day if a weekend) + the item’s full lead time in business days.
* **Supplier-uncommitted:** the PO has no promised date. **To purchase:** stage is `7-PO to place` or `Buy`.

### 1.3 How each line is assigned a line stage (step by step)

**Which lines are allocated:** open equipment lines only — `FULFILL_METHOD = Equipment`, `IS_OPEN_DEMAND` and `DEMAND_QTY > 0`. Software, services, kits, freight and EQ-discount lines get no stage here. (Non-equipment *Fulfill-Only / Service* lines get a label of their own in a separate table, but are not supply-allocated.)

**A stage belongs to an allocation row, not to a whole line.** Each line starts with `remaining demand = DEMAND_QTY`. The engine runs the passes below in order. Every pass takes `MIN(remaining demand, supply quantity)`, writes one row (one **Sub No**) for that quantity with the stage of the pass, and reduces the remaining demand. A line therefore has one row if one supply covers it, and several rows if it is split. Sub No is numbered per line in stage order (rank 10 → 90), then in the order the rows were created.

| Pass | Stage | How a line gets it | Supply pool & matching | Ship-ready date on the row |
|---|---|---|---|---|
| 1 | **00-Reserved OH** | The line has an Oracle reservation to on-hand stock (reservation type RES-OH). | The line’s own reservations, in reservation-id order. Quantity = MIN(remaining, reserved qty). Not re-checked against on-hand, because reserved stock is already removed from the free on-hand pool. | Reservation date = today |
| 2 | **00-Reserved CL PO** | The line has a reservation to a PO whose shipment is **closed** (closed code CLOSED or closed flag Y) — i.e. already received. | Same as pass 1 for reservation type RES-PO with the closed PO. | PO promised date, else need-by date, else end of this week (never earlier than the end of the current week) |
| 3 | **00-Reserved PO** | The line has a reservation to an **open PO** (RES-PO) or to an **internal sales order** (RES-ISO). | Same as pass 1. Flagged *supplier-uncommitted* when the PO has no promised date. For an ISO: the ISO line’s promise date, else its schedule ship date. | As described; ISO uses its own dates |
| 4a | **Reserve to OH** (named) | Still short after passes 1–3, and unreserved on-hand exists for the same item and inventory org **in a locator whose segment (S1, S2 or S3) contains the sales-order number**, or contains the number of a PO whose header comment mentions the order number. | Lines are processed in file order; matching on-hand rows are consumed in supply-row order. | Today |
| 4b | **Reserve to OH** (priority) | Still short after 4a and the same item/org has any free on-hand. | Orders that still have at least one short line are ranked: **fewest short lines first**, then **earliest promise date**, then header id (ranking is computed once, before the pass). Inside an order, lines go by earliest promise date (no date last), then line id. Each line draws on the free on-hand rows of its item/org in supply-row order until filled or exhausted. | Today |
| 5a | **Reserve to PO** (named) | Still short and an open PO for the same item/org has a **header comment containing the order number**. | POs sorted by availability date, then id; quantity = MIN(remaining, PO remaining qty). | PO promised date, else need-by, else end of this week; never earlier than end of this week. Marked *supplier-uncommitted* if there is no promised date |
| 5b | **Reserve to PO** (priority) | Still short after 5a and open PO quantity exists for the item/org. | Same order priority as 4b (re-ranked with the remaining short lines); each line takes from the earliest-available PO rows first. | As 5a |
| 6 | **7-PO to place** | The line has a reservation to a **requisition** (RES-ER) that has not yet become a PO, and quantity is still short. | Quantity = MIN(remaining, requisition qty). Marked *to purchase*. | Lead-time date |
| 7 | **Buy** | Whatever quantity is still short after all passes: no stock, PO or requisition covers it. | One row for the remainder. Marked *to purchase*. | Lead-time date |

**Rules of thumb that follow from the code**
* **Order of preference:** the line’s own reservation first (OH, then closed PO, then open PO/ISO), then free on-hand, then open PO, then requisition, then Buy. On-hand is always used **before** open PO, even if a PO would arrive sooner.
* **Named matches beat priority matches** within the Reserve to OH and Reserve to PO passes (locator or PO comment naming the order).
* **Free supply is net of reservations:** on-hand excludes sub-inventories containing SHIP, MRB or DROP and subtracts reserved quantity; open PO = quantity − received − cancelled − reserved, with cancelled/closed POs removed. So reserved stock is never counted twice.
* **Lead-time date** = today (rolled to Monday if a weekend) + the item’s full lead time in business days. Used for Buy, 7-PO to place and as the fallback date for a reservation with no date.
* **“To purchase” = stage 7-PO to place or Buy.** **“Supplier-uncommitted”** = the supplying PO has no promised date (counted in the *Supplier-uncommitted* column on the Summary tab).
* **Line and order ship-ready date:** the line’s date is the **latest** date among its rows; the order’s ship-ready date on the Summary tab is the latest across all its allocation rows (including Buy rows). On the Equipment revenue tab the *worst supply date* ignores to-purchase rows, and those lines are instead flagged as MATERIAL RISK.

**Volumes in the latest run (equipment allocation rows)**

| Stage | Rows | Distinct lines | Qty | USD value |
|---|---|---|---|---|
| 00-Reserved OH | 1,055 | 1,055 | 9,208 | $1.9M |
| 00-Reserved CL PO | 167 | 166 | 625 | $0.3M |
| 00-Reserved PO | 4,193 | 4,188 | 51,718 | $10.8M (264 rows supplier-uncommitted) |
| Reserve to OH | 2,024 | 1,988 | 10,483 | $2.1M |
| Reserve to PO | 2,510 | 2,419 | 100,493 | $1.1M (120 rows supplier-uncommitted) |
| 7-PO to place | 1 | 1 | 50 | $8.5K |
| Buy | 18,565 | 18,565 | 166,120 | $46.2M |

A line can appear in more than one stage row when it is split, so line counts do not add up across stages. “Buy” carries the bulk of the value; confirm that this is expected for the extract date.

**Where to see it in the app:** the **Allocation** tab for an order shows each line’s rows (Sub No, stage, supply source, quantity, available date) and a plain-language rule for each stage.

---

## 2. Summary tab (ship readiness) — source: Sales Order Ship Readiness [449616] / Orders drill-down [449636]

One row per sales order with open equipment demand (plus software-only orders). Filters: **Operating Unit** and **Customer** (top-5 customers by revenue of the selected unit, plus “All other customers”).

| Field | Definition |
|---|---|
| **Ship-ready date** | the **latest** supply-available date across the order’s equipment allocation rows (an order is ready only when its last line is) |
| **Ship week / Week no.** | Monday of max(ship-ready date, today). Week 1 = the current week; Week n = weeks since the current week + 1. Late/past-due orders are therefore in Week 1. Software-only orders are placed in Week 1 |
| **Earliest promise date** | earliest promise date across the order’s equipment allocation rows |
| **Days late vs promise** | ship-ready date − earliest promise date (positive = ready after promise) |
| **Equipment USD** | Σ allocated qty × unit price × USD rate for the order’s allocation rows |
| **Container equipment USD** | open value of kit/model parents rolled up to equipment |
| **EQ discount USD** | open value of lines whose item number contains “EQ DISCOUNT” (negative; these items are *Fulfill-Only* by item type but are deliberately counted as equipment) |
| **Software USD** | open value of Software lines + kit parents rolled up to software |
| **TOTAL_USD** | Equipment + Container equipment + EQ discount + Software |

### KPI cards
| KPI | Calculation |
|---|---|
| **Orders** | number of orders after the slicers |
| **Total revenue (all weeks)** | Σ TOTAL_USD |
| **Week 1 revenue** | Σ TOTAL_USD where Week no. = 1 |
| **Weeks 1–12 revenue** | Σ TOTAL_USD where Week no. 1…12 |
| **Orders ready after promise** | count of orders with Days late vs promise > 0 |

### Revenue by ship week chart
Stacked columns by Operating Unit of TOTAL_USD for weeks 1–12; the line is the cumulative total on the right axis.

### Revenue by ship window table
Buckets: Week 1 · Weeks 2–4 · Weeks 5–12 · Weeks 13–19 · Week 20 · Beyond week 20.
Columns: **Orders**, **Equipment – On-hand/committed** (allocation rows that are *not* uncommitted/to-purchase, plus container equipment), **Equipment – Supplier-uncommitted** (allocation rows on a PO with no promise date, or still to purchase), **EQ Discount**, **Software**, **Total**.

---

## 3. Equipment revenue tab — source: eqdash [449638], eqlines [449621], regions [449618]

### 3.1 Revenue definition (“Equipment Revenue”)
Per order line, then summed:
* **In:** Equipment lines · model/kit lines that roll up to equipment · EQ-discount lines (discounts keep their negative sign).
* **Out:** all software lines (including software-rolled-up kits), services, freight and other lines. Return / RMA / internal / ISO orders are excluded.
* Two **slices**, both shown in the same buckets:
  * **PLANNED** – still-open value = (ordered − shipped qty) × price × USD rate.
  * **ACTUAL** – shipped value = shipped qty × price × USD rate for lines shipped between the **quarter start and today**.

### 3.2 Order attributes
| Field | Definition |
|---|---|
| **Backlog / ASO** | by Customer PO number: `PENDING` = **ASO**; any other PO = **Backlog**; blank PO = **Gap** |
| **Gap (UNKNOWN)** | in-scope revenue that cannot be placed: no PO number, or a missing currency rate |
| **Order promise date** | earliest promise date among the order’s open revenue lines (fallback: earliest of all its lines) |
| **Region** | ship-to country (most frequent across the order’s lines) mapped to North America / Latin America / Europe / Middle East / Africa / APAC; if the country is unmapped, falls back on the operating unit; otherwise **Unassigned** (shown only when no region is ticked) |

### 3.3 Quarter scope and weeks
* **In scope** = order promise date between quarter start and quarter end, inclusive. Orders promised before/after the quarter are shown on the *Outside Quarter* card only. Orders with **no promise date** are a separate total and are excluded from the quarter total unless the toggle “Include NO PROMISE DATE” is on.
* **Week ending = Friday.** Weeks run from the Friday on/after quarter start to the quarter end. Revenue dated after the last week still counts in the quarter total and is shown as “of which beyond [last week]”.
* Closed weeks show actual shipped; the current week shows shipped to date + remaining plan; future weeks show plan.

### 3.4 CTP classification (per order)
Built from the order’s allocation rows (equipment category only):
* **Hardware lines** – distinct open equipment lines.
* **Lines short (material lines)** – lines with any quantity at stage `Buy` / `7-PO to place` (to purchase).
* **PO-risk lines** – lines on a PO (`00-Reserved PO` / `Reserve to PO`) that is supplier-uncommitted or available after quarter end.
* **Worst supply date** – latest supply-available date across lines that are *not* to-purchase.

Classification, first match wins:
1. **Gap** – blank PO or missing FX rate
2. **NO PROMISE DATE**
3. **MATERIAL RISK** – any line short
4. **PO RISK** – any PO-risk line
5. **SECURE – ON TIME** – worst supply date ≤ order promise date (no hardware ⇒ treated as supported)
6. **SECURE – LATE** – otherwise

Actual (shipped) revenue is classified by last ship date vs promise: on-time or late.

**Week placement:** SECURE orders by worst supply date; PO RISK / MATERIAL RISK by order promise date; both never earlier than today. Actual revenue sits in the week of its last ship date.

### 3.5 KPI cards
| KPI | Calculation |
|---|---|
| **Backlog Equipment Revenue** | Σ equipment revenue, in-scope orders with PO ≠ PENDING (actual + planned) |
| **ASO Equipment Revenue** | Σ equipment revenue, in-scope orders with PO = PENDING |
| **BTR – Region / Company Total** | from an uploaded CSV (columns *Region*, *BTR Amount*). Company Total = sum of all regions (any “Total” row in the file is ignored). Selected region(s) = their amounts. $0 if no file. BTR is expected bookings, not sales orders, and has no drill-down. The file is stored in the user’s browser only |
| **Gap (exceptions)** | Σ revenue of Gap orders in scope |
| **Quarter Revenue in Scope** | **Backlog + ASO + BTR + Gap** (software never included) |

The matrix shows Backlog and ASO by classification × week ending, with a weekly total, the separate NO PROMISE DATE row and the quarter total. Every amount is a link to the underlying orders; each order can be expanded to the lines that make up the amount (and ties to the dollar).

---

## 4. Order Holds tab

Same data, quarter scope, week buckets, region filter and equipment-revenue calculation as §3; software excluded; Gap orders not part of this view.

### 4.1 What counts as “on hold”
An order is on hold if it has at least one **active hold on its header or on one of its equipment-revenue lines**. Holds on software lines are ignored. Hold status is the **current snapshot** of the extract.

**Revenue at risk = the order’s open (PLANNED) equipment revenue** (the whole order, not only the held lines). Shipped revenue cannot be held.

### 4.2 Hold-name groups
| Group | Hold names matched |
|---|---|
| **Design / Frequency** | any name containing *Design* or *Frequency* (Design Hold, Frequency Hold, Design/Frequency Hold, and combined names like “Design Hold … Scheduling Hold”) |
| **Financial** | names starting *Credit* (e.g. Credit Check Failure), *Cash in Advance* (Cash in Advance - Deliv Pick Hold), *Financial* (Financial - Deliv Ship Hold) |
| **Other** | everything else (Scheduling, Planning, Await Customer PO…, Letter of Credit, Export Compliance, OM Picking/Shipping, BackToBack…) |

### 4.3 One primary category per sales order (no double counting)
Applied at **order level**, first match wins:
1. **Design / Frequency** (any hold in that group)
2. **ASO** (the order is an ASO and has any hold)
3. **Financial** (any financial hold)
4. **Other holds**

So Design + Credit ⇒ Design/Frequency; an ASO with a financial hold ⇒ ASO; a Backlog order with only Credit ⇒ Financial. All holds of the order are still listed in the drill-down; its revenue is counted once.

### 4.4 KPIs
| KPI | Calculation |
|---|---|
| **Design / Frequency Hold Revenue at Risk** | Σ planned equipment revenue of unique orders with primary category 1 |
| **ASO Revenue at Risk** | … primary category 2 |
| **Financial Hold Revenue at Risk** | … primary category 3 |
| **Other Holds** | … primary category 4 |
| **Total Hold Revenue at Risk** | sum of the four (= Σ of unique held orders); card also shows % of in-scope equipment revenue |

Weekly matrix: Backlog and ASO equipment revenue per week ending, an amber “orders on hold” row and the four category rows, plus a combined total-at-risk block. Region and Operating-Unit tables show the four categories, Total Risk, in-scope revenue and % at risk, ending with the **Company Total Revenue at Risk**. Every amount drills to the held sales orders with customer, region/unit, promise date, week ending, all hold names, primary category, Backlog/ASO, equipment revenue (counted once), held line count and header-hold details.

---

## 5. Assumptions, caveats and open items

1. **Quarter dates are hard-coded** in the pipeline SQL of actions 449638 and 449621 (`2026-10-01` – `2027-01-01`). They must be edited for the next quarter. “Today” is the pipeline run date, not the viewer’s date.
2. **Summary vs Equipment revenue are different bases.** Summary = supply-driven ship readiness of all open orders (includes software, not limited to the quarter promise date). Equipment revenue = promise-date-scoped quarter view, equipment only, with shipped actuals. Totals are not expected to match; they have not been reconciled line by line in this document.
3. **EQ discount** items are identified by item number (“EQ DISCOUNT”), because their item type classes them as Fulfill-Only.
4. **Hold names** in the extract contain a “?” where a separator was lost (e.g. “Design Hold ? Scheduling Hold”, “COR ASO ? DELIV PICK HOLD”). Matching is by keyword, so the first is Design/Frequency and the second is Other.
5. **Letter of Credit** is classified Other (not Financial) because the requested Financial list names only Credit, Cash in Advance and Financial - Deliv Ship Hold. Confirm if it should move.
6. **An ASO with any hold** (even only an “Other” hold) is classified ASO. Confirm if ASO should apply only to ASOs with a Design/Financial hold.
7. Region mapping is a country → region lookup in action 449618; unmapped countries fall to the operating unit, then Unassigned.
8. BTR is user-supplied per browser and is not stored in the pipeline.
9. Not verified here: the exact release logic of the *Active line holds (raw)* extract (action 449570) and any row-level tie-out of Summary EQUIPMENT_USD to the Equipment-revenue PLANNED amounts.

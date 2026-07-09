# reporting-dashboards — Correctness Design

## PBT Properties

### P1 — CSV row count equals data length + 1 header
```
∀ rows[]: toCsv(rows).split("\n").length === rows.length + 1
```
(empty input → empty string, 0 lines; non-empty → header + N data rows)

**Generator**: `fc.array(fc.record({ id: fc.uuid(), name: fc.string() }), { minLength: 1, maxLength: 50 })`
**Runs**: 50

---

### P2 — CSV serialization is deterministic
```
∀ rows[]: toCsv(rows) === toCsv(rows)
```
Same input always produces exactly the same output (no timestamps, random UUIDs, or non-determinism inside toCsv).

**Generator**: same as P1
**Runs**: 50

---

### P3 — CSV column count equals header count for every row
```
∀ rows[]:
  let lines = toCsv(rows).split("\n");
  let headerCount = lines[0].split(",").length;
  lines.slice(1).every(line => parseColumns(line).length === headerCount)
```

**Generator**: `fc.array(fc.record({ a: fc.string(), b: fc.integer(), c: fc.boolean() }), { minLength: 1 })`
**Runs**: 50

---

## Deterministic Unit Assertions

| # | Test | Assertion |
|---|------|-----------|
| 1 | toCsv empty | `toCsv([])` === `""` |
| 2 | toCsv single row | one header line + one data line |
| 3 | toCsv escapes commas | value `"a,b"` → `"\"a,b\""` in output |
| 4 | toCsv escapes quotes | value `a"b` → `"a""b"` in output |
| 5 | row limit check | 1001 rows → REPORT_002 |
| 6 | row limit pass | 1000 rows → no error |
| 7 | unknown reportType → REPORT_003 | `exportCsv("unknown-type", ...)` throws REPORT_003 |

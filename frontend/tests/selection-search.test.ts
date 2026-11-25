import assert from "node:assert/strict";
import { test } from "node:test";
import { searchKey, searchOptions } from "../src/services/selection-search";

test("search normalizes accents, case and document/plate punctuation without changing stored data", () => {
  assert.equal(searchKey("João"), searchKey("JOA\u0303O"));
  assert.equal(searchKey("900.000.001-75"), "90000000175");
  assert.equal(searchKey("HML-1234"), "hml1234");
  const values = ["João da Silva", "90000000175"].map(searchKey);
  const options = [{ id: "7", label: "João da Silva", search: values }];
  for (const q of ["joao", "DA SIL", "900.000", "001-75"])
    assert.equal(searchOptions(options, q).visible[0].id, "7");
  assert.equal(searchOptions(options, "ausente").total, 0);
  assert.equal(options[0].label, "João da Silva");
});

test("thousands remain searchable beyond twenty suggestions; preferred vehicles do not hide other owners", () => {
  const options = Array.from({ length: 3000 }, (_, i) => ({
    id: String(i),
    label: `Modelo ${i}`,
    search: [searchKey(`Modelo ${i}`)],
    preferred: i === 2999,
  }));
  const result = searchOptions(options, "");
  assert.equal(result.total, 3000);
  assert.equal(result.visible.length, 20);
  assert.equal(result.visible[0].id, "2999");
  assert.equal(searchOptions(options, "Modelo 2498").visible[0].id, "2498");
  assert.equal(options[0].id, "0");
});

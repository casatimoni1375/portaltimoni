import test from 'node:test';
import assert from 'node:assert/strict';
import {rotatingStockCodeFilter} from '../lib/rotativo-filter.ts';
const col = codes => codes.map(c => [c]);
test('filtra pelo código (coluna B), sem fórmula e sem ROW()', () => {
  const spec = rotatingStockCodeFilter(col(['A1','B2','C3','D4']), [3,5]);
  assert.equal(spec.columnIndex, 1);
  assert.equal(spec.filterCriteria.condition, undefined);
  assert.ok(!JSON.stringify(spec).includes('ROW('));
  assert.deepEqual(spec.filterCriteria.hiddenValues.sort(), ['', 'A1', 'C3'].sort());
});
test('mantém visível código com espaço extra e oculta vazios', () => {
  const spec = rotatingStockCodeFilter(col([' 001 ','002','','003']), [2]);
  assert.ok(spec.filterCriteria.hiddenValues.includes(''));
  assert.ok(!spec.filterCriteria.hiddenValues.includes(' 001 '));
  assert.ok(spec.filterCriteria.hiddenValues.includes('002'));
});
test('sem itens encontrados dá erro claro', () => {
  assert.throws(() => rotatingStockCodeFilter(col(['A']), []), /não possui itens/);
});

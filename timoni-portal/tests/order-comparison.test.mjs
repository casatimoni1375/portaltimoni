import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
const source=stripTypeScriptTypes(await readFile(new URL('../lib/order-comparison.ts',import.meta.url),'utf8'));
const module=new vm.SourceTextModule(source);await module.link(()=>{throw Error('A comparação não deve depender de serviço externo');});await module.evaluate();
const {compareOrderDocuments:compare,parseComparisonNumber:number,validateComparisonDocument:validate}=module.namespace;
const line=(code,patch={})=>({code,description:'Produto',quantity:2,price:10,ipi:null,...patch});
const doc=rows=>({filename:'teste.xlsx',sheet:'Itens',rows});
test('pareia por código preservando zeros e ignora a ordem das linhas',()=>{const result=compare(doc([line('001'),line('002')]),doc([line('002'),line('001')]));assert.equal(result.itens.length,2);assert.equal(result.itens[0].codigo_fornecedor_documento,'001');assert.equal(result.itens[0].divergencias.length,0);assert.equal(result.totais.subtotal_mcr,40);});
test('não equipara código com zeros diferentes e separa faltantes de extras',()=>{const result=compare(doc([line('001')]),doc([line('1')]));assert.ok(result.itens[0].divergencias.includes('item_faltante'));assert.ok(result.itens[1].divergencias.includes('item_extra'));});
test('códigos duplicados nunca recebem correspondência arbitrária',()=>{const result=compare(doc([line('001')]),doc([line('001'),line('001')]));assert.equal(result.itens.length,3);assert.ok(result.itens.every(item=>item.divergencias.includes('pareamento_incerto')));});
test('diferencia tolerância de preço, quantidade e IPI',()=>{const result=compare(doc([line('A',{ipi:5}),line('B')]),doc([line('A',{price:10.05,quantity:3,ipi:6}),line('B',{price:10.06})]));assert.ok(!result.itens[0].divergencias.includes('preco'));assert.ok(result.itens[0].divergencias.includes('quantidade'));assert.ok(result.itens[0].divergencias.includes('ipi'));assert.ok(result.itens[1].divergencias.includes('preco'));});
test('dados ausentes nunca viram zero nem item conferido',()=>{const result=compare(doc([line('A',{quantity:null})]),doc([line('A')]));assert.equal(result.totais.subtotal_mcr,null);assert.ok(result.itens[0].divergencias.includes('outra'));assert.equal(result.itens[0].preco_bruto_mcr,null);});
test('leitura numérica respeita o separador escolhido e rejeita texto inválido',()=>{assert.equal(number('1.234,56','comma'),1234.56);assert.equal(number('1,234.56','dot'),1234.56);assert.equal(number('1.234','comma'),1234);assert.equal(number(1.234,'comma'),1.234);assert.equal(number(''),null);assert.equal(number('abc'),null);});
test('validação bloqueia números negativos ou não finitos e excesso de linhas',()=>{assert.throws(()=>validate(doc([line('A',{quantity:-1})])));assert.throws(()=>validate(doc([line('A',{price:Infinity})])));assert.throws(()=>validate(doc(Array.from({length:2001},()=>line('A')))));});

test('fornecedores: compara apenas a mesma cesta e não indica menor preço para quantidade diferente',()=>{
 const result=module.namespace.compareSupplierDocuments(doc([line('A',{unit:'UN'}),line('B',{unit:'UN'})]),doc([line('A',{unit:'UN',price:9}),line('B',{unit:'UN',quantity:5,price:8})]));
 assert.equal(result.supplierComparison.comparableItems,1);assert.equal(result.supplierComparison.rows[0].cheaper,'second');assert.equal(result.supplierComparison.rows[0].saving,2);assert.equal(result.supplierComparison.rows[1].cheaper,null);assert.equal(result.supplierComparison.subtotalFirst,20);assert.equal(result.supplierComparison.subtotalSecond,18);
});
test('fornecedores: descrição idêntica e unidade equivalente permitem códigos distintos',()=>{
 const result=module.namespace.compareSupplierDocuments(doc([line('001',{unit:'UN'})]),doc([line('FAB-X',{unit:'UND',price:9})]));
 assert.equal(result.supplierComparison.rows[0].cheaper,'second');assert.ok(result.itens[0].divergencias.includes('codigo'));assert.equal(result.itens[0].codigo_fornecedor_documento,'FAB-X');
});
test('fornecedores: diferença de embalagem, unidade ou IPI impede destaque de menor preço',()=>{
 for(const patch of [{description:'Produto diferente'},{unit:'KG'},{ipi:5},{unit:''}]){const result=module.namespace.compareSupplierDocuments(doc([line('A',{unit:'UN'})]),doc([line('A',{unit:'UN',price:5,...patch})]));assert.equal(result.supplierComparison.rows[0].cheaper,null);}
});
test('fornecedores: preserva casas decimais do preço unitário ao calcular a cesta',()=>{const result=module.namespace.compareSupplierDocuments(doc([line('A',{unit:'UN',quantity:100,price:1.2345})]),doc([line('A',{unit:'UN',quantity:100,price:1.2301})]));assert.equal(result.supplierComparison.rows[0].cheaper,'second');assert.equal(result.supplierComparison.rows[0].saving,.44);assert.equal(result.supplierComparison.subtotalFirst,123.45);});

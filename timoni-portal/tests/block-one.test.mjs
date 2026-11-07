import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
async function source(name) { const js = stripTypeScriptTypes(await readFile(new URL(`../lib/${name}.ts`, import.meta.url),'utf8')); return import('data:text/javascript;base64,'+Buffer.from(js).toString('base64')); }
const { createGoogleTokenRefresher } = await source('google-token-refresh');
const { isFutureMeeting, segmentKey, possibleDuplicates, positivePage } = await source('block-one-utils');
const { withinDeadline } = await source('request-deadline');
const token = { refreshToken: 'test-refresh', accessToken: 'old', expiresAt: 1 };

test('Google: falha temporária tenta uma vez e chamadas simultâneas compartilham a renovação', async () => {
  let calls=0;
  const refresh=createGoogleTokenRefresher(async()=>{calls++;return calls===1 ? Response.json({error:'temporarily_unavailable'},{status:503}) : Response.json({access_token:'new',expires_in:3600});});
  const results=await Promise.all([refresh(token,'id','secret'),refresh(token,'id','secret')]);
  assert.equal(calls,2);for(const value of results){assert.equal(value.accessToken,'new');assert.equal(value.error,undefined);}
});
test('Google: autorização revogada não repete nem mantém token utilizável',async()=>{
  let calls=0;const refresh=createGoogleTokenRefresher(async()=>{calls++;return Response.json({error:'invalid_grant'},{status:400});});
  const result=await refresh(token,'id','secret');assert.equal(calls,1);assert.equal(result.error,'RefreshAccessTokenError');assert.equal(result.accessToken,undefined);
});
test('Google: duas falhas preservam refresh token e impõem espera antes da próxima tentativa',async()=>{
  let calls=0;let now=100000;const refresh=createGoogleTokenRefresher(async()=>{calls++;throw Error('offline');},()=>now);
  const result=await refresh(token,'id','secret');assert.equal(calls,2);assert.equal(result.error,'SessionTemporarilyUnavailable');assert.equal(result.refreshToken,'test-refresh');
  await refresh(result,'id','secret');assert.equal(calls,2);now+=16000;await refresh(result,'id','secret');assert.equal(calls,4);
});
test('Reunião de hoje deixa Próximas depois do horário, sem arquivar o registro',()=>{
  const now=new Date('2026-11-07T15:30:00-03:00');assert.equal(isFutureMeeting('2026-11-07','15:00',now),false);assert.equal(isFutureMeeting('2026-11-07','16:00',now),true);assert.equal(isFutureMeeting('2026-11-07','',now),true);assert.equal(isFutureMeeting('2026-11-06','',now),false);
});
test('Duplicidades são alertas: nenhuma entrada é alterada ou descartada',()=>{
  const values=[{name:'Ceramica'},{name:'Cerâmica'},{name:'Ceramico'},{name:'Embalagens'}];const snapshot=JSON.stringify(values);
  assert.equal(possibleDuplicates(values,item=>segmentKey(item.name))[0].length,3);assert.equal(JSON.stringify(values),snapshot);
});
test('Paginação recusa valores negativos, decimais e infinitos',()=>{
  for(const value of ['-1','0','Infinity','1.5','NaN',null])assert.equal(positivePage(value),1);assert.equal(positivePage('3'),3);
});
test('Sino: prazo excedido retorna ao chamador; sucesso não espera o temporizador',async()=>{
  await assert.rejects(withinDeadline(new Promise(()=>{}),5),/Tempo/);assert.equal(await withinDeadline(Promise.resolve(3),5000),3);
});

import assert from 'node:assert/strict';
import { createScoreHandler } from '../supabase/functions/submit-high-score/handler.js';

const key = 'sb_secret_server_only_test';
const settings = {supabaseUrl:'https://example.supabase.co', serviceRoleKey:key};
const body = {
  p_submission_id:'00000000-0000-4000-8000-000000000001', p_player_name:' Visitor ', p_country_code:'PH',
  p_shots:Array.from({length:10}, () => ({pocket_id:'experiences', bounces:20})),
};
const request = (payload = body, extra = {}) => new Request('https://example.supabase.co/functions/v1/submit-high-score', {
  method:'POST', headers:{'Content-Type':'application/json','cf-connecting-ip':'192.0.2.10',...extra}, body:JSON.stringify(payload),
});
let calls = [];
const handler = createScoreHandler(settings, async (url, options) => {
  calls.push({url:String(url),options});
  return Response.json({saved:true,best:{player_name:'Visitor',score:600,country_code:'PH'}});
});
let response = await handler(request());
assert.equal(response.status,200);
assert.equal((await response.json()).best.score,600);
assert.equal(response.headers.get('Access-Control-Allow-Origin'),'*');
assert.match(calls[0].url,/\/rest\/v1\/rpc\/submit_high_score_via_backend$/);
assert.equal(calls[0].options.headers.apikey,key);
assert.equal(calls[0].options.headers.Authorization,undefined,'Secret API keys are not JWTs');
let forwarded = JSON.parse(calls[0].options.body);
assert.equal(forwarded.p_player_name,'Visitor');
assert.equal(forwarded.p_client_ip,'192.0.2.10');
assert.equal(forwarded.score,undefined);
assert.equal(forwarded.p_submission_id,body.p_submission_id,'Retries must preserve the browser submission ID');

for (const payload of [null,{}, {...body,p_shots:[]},{...body,p_player_name:'\u0000bad'},
  {...body,p_country_code:'ph'},{...body,p_submission_id:'bad'}, {...body,p_client_ip:'203.0.113.1'},
  {...body,p_shots:body.p_shots.map(shot=>({...shot,bounces:1.5}))},
  {...body,p_shots:body.p_shots.map(shot=>({...shot,pocket_id:'unknown'}))}]) {
  assert.equal((await handler(request(payload))).status,400);
}
assert.equal(calls.length,1,'Invalid payloads must never reach privileged database code');
assert.equal((await handler(new Request('https://example.test',{method:'OPTIONS'}))).status,204);
assert.equal((await handler(new Request('https://example.test'))).status,405);
assert.equal((await handler(new Request('https://example.test',{method:'POST',body:'not json'}))).status,415);
assert.equal((await handler(new Request('https://example.test',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'}))).status,400);
assert.equal((await handler(request({...body,p_player_name:'x'.repeat(9000)}))).status,413);
assert.equal((await handler(request(body,{'cf-connecting-ip':'invalid'}))).status,503);
assert.equal((await createScoreHandler()(request())).status,503);
assert.equal(calls.length,1);

await handler(request(body,{'cf-connecting-ip':'','x-forwarded-for':'203.0.113.99, 192.0.2.20'}));
assert.equal(JSON.parse(calls.at(-1).options.body).p_client_ip,'192.0.2.20','Use gateway-appended IP, not client-prepended value');
await handler(request(body,{'cf-connecting-ip':'2001:db8::1'}));
assert.equal(JSON.parse(calls.at(-1).options.body).p_client_ip,'2001:db8::1');

for (const [status,result,expected] of [
  [429,{},429],[400,{code:'22023'},400],[404,{code:'PGRST202'},503],
  [403,{message:key},502],[500,{message:key},502],
]) {
  const failed = createScoreHandler(settings,async()=>Response.json(result,{status}));
  const resultResponse = await failed(request());
  assert.equal(resultResponse.status,expected);
  assert(!(await resultResponse.text()).includes(key),'Never expose privileged credentials or raw upstream errors');
  if (status===429) assert.equal(resultResponse.headers.get('Retry-After'),'60');
}
const timed = createScoreHandler({...settings,timeoutMs:1},async(_url,{signal})=>{
  await new Promise(resolve=>setTimeout(resolve,15));
  assert(signal.aborted);
  throw new DOMException('Aborted','AbortError');
});
assert.equal((await timed(request())).status,502);
console.log('Score Edge checks passed: public CORS, request limits, input validation, trusted connection forwarding, privileged server-only calls, rate limits and sanitized failures.');

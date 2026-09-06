import {describe,it,expect} from 'vitest';
import {canonicalJson,fingerprint,normalizeInputShape as shape} from './fingerprint.js';
const fp=(input:unknown,name='read')=>fingerprint('tool',{name},shape(input));
describe('provisional fingerprint V1',()=>{
 it('sorts nested keys and hashes canonical JSON with SHA256',()=>{expect(canonicalJson({b:2,a:{z:1,c:3}})).toBe('{"a":{"c":3,"z":1},"b":2}');expect(fp({a:1})).toMatch(/^[a-f0-9]{64}$/);});
 it('keeps IDs, homes, temp paths, dates, ports and secrets out of shape',()=>{
  expect(fp({file_path:'/tmp/random.ts',id:'a',timestamp:1,password:'abc',url:'https://example.org:123/a?key=secret'})).toBe(fp({url:'https://example.org:999/b',password:'xyz',timestamp:9,id:'b',file_path:'C:\\Users\\someone\\project\\file.ts'}));
  expect(JSON.stringify(shape({token:'private',command:'TOKEN=abc curl -H secret https://example.org:22/private'}))).not.toContain('secret');
 });
 it('property: recursive object order and volatile literals do not affect fingerprints',()=>{
  for(let i=0;i<100;i++){expect(fp({nested:{id:'id-'+i,path:'/tmp/'+i+'.ts'},value:i})).toBe(fp({value:42,nested:{path:'/home/example/project/file.ts',id:'fixed'}}));}
 });
 it.each([
  [{command:'git status'},{command:'git reset'}], [{method:'GET'},{method:'POST'}],
  [{sql:'SELECT * FROM widgets'},{sql:'DELETE FROM widgets'}], [{sql:'SELECT * FROM widgets'},{sql:'SELECT * FROM accounts'}],
  [{file_path:'a.ts'},{file_path:'a.py'}], [{url:'https://example.org'},{url:'https://example.net'}],
  [{nested:{a:1}},{nested:{a:1,b:2}}]
 ])('retains decision-bearing differences %j',(a,b)=>expect(fp(a)).not.toBe(fp(b)));
 it('preserves named MCP identity and does not merge read/bash',()=>{expect(fp({},'read')).not.toBe(fp({},'bash'));expect(fp({},'github.create_issue')).not.toBe(fp({},'github.close_issue'));});
});
it('normalizes npm scripts, aliases and SQL literals without leaking literal text',()=>{
 expect(fp({command:'npm run test'})).not.toBe(fp({command:'npm run build'}));
 expect(fp({},'Read')).toBe(fp({},'read_file'));
 expect(JSON.stringify(shape({sql:"SELECT 'from credential_value' FROM widgets"}))).not.toContain('credential_value');
 expect(fp({file_path:'/tmp/550e8400-e29b-41d4-a716-446655440000.ts',uuid:'550e8400-e29b-41d4-a716-446655440000'})).toBe(fp({file_path:'/home/example/project/new.ts',uuid:'other'}));
});
it('omits optional volatile fields and keeps quoted command secrets opaque',()=>{
 expect(fp({path:'a.ts'})).toBe(fp({path:'b.ts',id:'random',timestamp:3,result_count:50,secret:'private'}));
 expect(JSON.stringify(shape({command:'echo "password;NEVER_RETAIN_THIS"'}))).not.toContain('NEVER_RETAIN_THIS');
});

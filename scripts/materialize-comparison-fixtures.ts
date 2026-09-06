import {readFileSync,writeFileSync} from 'node:fs';
import {trace} from '../packages/core/test/comparison-fixture.js';
const path='fixtures/comparison/structural-pairs.json';
const pairs=JSON.parse(readFileSync(path,'utf8'));
for(const pair of pairs){pair.goodTrace=trace(pair.good,pair.id+'-good');pair.badTrace=trace(pair.bad,pair.id+'-bad');}
writeFileSync(path,JSON.stringify(pairs,null,2)+'\n');

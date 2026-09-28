// Run once from a scheduler, or continuously from a supervised Node service.
import {setTimeout as pause} from 'node:timers/promises';
const {APP_ORIGIN,QUEUE_SECRET}=process.env;
if(!APP_ORIGIN||!QUEUE_SECRET)throw new Error('APP_ORIGIN and QUEUE_SECRET are required');
const origin=new URL(APP_ORIGIN);
if(!['https:','http:'].includes(origin.protocol))throw new Error('Invalid APP_ORIGIN');
const continuous=process.argv.includes('--continuous');
let stopping=false;
process.on('SIGTERM',()=>{stopping=true});process.on('SIGINT',()=>{stopping=true});
async function dispatch(){
 const response=await fetch(new URL('/api/queue/dispatch',origin),{method:'POST',headers:{authorization:'Bearer '+QUEUE_SECRET},signal:AbortSignal.timeout(40000),redirect:'manual'});
 if(!response.ok)throw new Error('Queue dispatch failed: '+response.status);
 const data=await response.json();console.log(new Date().toISOString(),'Jobs checked:',data.processed);
}
do{
 try{await dispatch()}catch(e){console.error(e.message);if(!continuous){process.exitCode=1;break;}}
 if(continuous&&!stopping)await pause(5000);
}while(continuous&&!stopping);

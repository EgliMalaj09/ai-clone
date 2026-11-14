// Renders the NgaZero card loader in Blender and converts it to the files the site uses.
//   node scripts/render-loader.mjs [path-to-blender]
// Needs Blender 4.2+ and FFmpeg (with libwebp) on this computer.
// Output: public/media/loader-cards.webp (animated, transparent) and public/media/loader-cards.png (still frame for reduced motion).
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync,copyFileSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

const blender=process.argv[2]||process.env.BLENDER||'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe';
const frames=48,size=360,samples=32;
const work=mkdtempSync(path.join(tmpdir(),'ngazero-loader-'));
const run=(cmd,args)=>{const r=spawnSync(cmd,args,{stdio:'inherit'});if(r.status!==0)throw new Error(cmd+' failed');};
try{
 run(blender,['--background','--factory-startup','--python','scripts/blender/loader-cards.py','--',work,String(frames),String(size),String(samples)]);
 run('ffmpeg',['-y','-v','error','-framerate','24','-i',path.join(work,'f_%04d.png'),'-c:v','libwebp_anim','-pix_fmt','yuva420p','-lossless','0','-q:v','78','-compression_level','6','-loop','0','public/media/loader-cards.webp']);
 copyFileSync(path.join(work,'f_0012.png'),'public/media/loader-cards.png');
 console.log('loader-cards.webp',Math.round(statSync('public/media/loader-cards.webp').size/1024)+' KB');
}finally{rmSync(work,{recursive:true,force:true});}

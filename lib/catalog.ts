import type {AdminTemplate,WorkflowStep} from './contracts';
const entries:[string,string,number,number,string][]=[
 ['Formula Driver','Sports',299,85,'Step into the paddock. Your own cinematic racing moment, from one photo.'],
 ['Superhero Transformation','Transformation',349,110,'An ordinary photo. An extraordinary alter ego. Become the hero of your own story.'],
 ['Luxury Photoshoot','Fashion',199,60,'Parisian light, impeccable styling, and an editorial moment made for you.'],
 ['Wedding Cinematic','Couples',499,125,'Turn your favorite photo together into a little piece of forever.'],
 ['Cyberpunk City','Cinematic',399,130,'Neon streets. Rain-soaked reflections. Your face in a future worth imagining.'],
 ['Medieval Warrior','Fantasy',349,100,'Enter a world of ancient castles and epic adventures as its leading character.'],
 ['Action Hero','Action',399,140,'All the intensity of a blockbuster, with you in the starring role.'],
 ['Astronaut','Travel',299,90,'Go beyond the ordinary. See yourself on an unforgettable journey into space.'],
 ['Red Carpet','Social',249,75,'Your premiere moment, complete with flashbulbs and cinematic glamour.'],
 ['Anime Transformation','Anime',299,100,'Reimagine yourself as an original anime character in a vivid new world.'],
 ['Football Stadium','Sports',349,110,'Walk out of the tunnel and into your own stadium-sized moment.'],
 ['Future Self','Transformation',249,70,'Meet a cinematic interpretation of your future self. A little imagination goes a long way.'],
 ['Time Traveler','Cinematic',399,135,'A portrait that crosses centuries, from clockwork streets to another time.'],
 ['Fantasy Character','Fantasy',349,95,'An enchanted forest, a touch of magic, and a character inspired by you.'],
 ['CEO Billboard','Business',199,65,'Picture your next big chapter on a larger-than-life city billboard.'],
 ['Movie Explosion','Action',699,220,'The dramatic walk-away scene. Big-screen energy with a spectacular finish.'],
 ['Fashion Runway','Fashion',299,100,'Own the runway in a high-fashion film created around your photo.'],
 ['Travel Cinematic','Travel',399,120,'A sunlit coastal escape, starring you. Make an ordinary photo feel like a movie.'],
];
export const slugify=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
export const defaultStep=(type:WorkflowStep['type']='video'):WorkflowStep=>({id:crypto.randomUUID(),type,provider:'mock',model:'studio-demo',prompt:'Create a cinematic {{template_name}} featuring the person in {{user_image_1}}. Preserve identity. Output {{aspect_ratio}}, {{duration}} seconds.',negativePrompt:'distorted face, extra limbs, text, watermark',inputs:{image:'{{user_image_1}}'},output:type==='video'?'video_output':'prepared_image',settings:{},duration:5,resolution:'720p',aspectRatio:'9:16',cost:85});
export function seedTemplates():AdminTemplate[]{return entries.map(([name,category,price,estimatedCost,description],i)=>{
 const slug=slugify(name);const step=defaultStep();step.id=`seed-step-${i}`;step.cost=estimatedCost;
 if(name==='Wedding Cinematic'){step.prompt='Create a romantic wedding cinematic with both people in {{user_image_1}} and {{user_image_2}}. Preserve both identities.';step.inputs={image:'{{user_image_1}}',second_image:'{{user_image_2}}'};}
 return {id:`tpl_${slug}`,slug,name,category,price,estimatedCost,description,currency:'USD',thumbnail:`/media/${slug}.webp`,previewVideo:`/media/${slug}.mp4`,previewImages:[],active:true,featured:i<6,trending:[0,1,4,10].includes(i),isNew:[3,9,12,15,17].includes(i),popular:[0,2,3,7,10].includes(i),requiredImageCount:name==='Wedding Cinematic'?2:1,aspectRatio:'9:16',duration:5,resolution:'720p',provider:'mock',model:'studio-demo',generationType:'video',hiddenPrompt:step.prompt,negativePrompt:step.negativePrompt,settings:{},workflow:[step],createdAt:Date.UTC(2026,8,10)-i*86400000};
});}

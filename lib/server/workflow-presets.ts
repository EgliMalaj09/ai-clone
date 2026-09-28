import type {AdminTemplate,WorkflowStep} from '../contracts';

const scenes:Record<string,string>={
  'formula-driver':'a professional racing driver in an original unbranded racing suit, holding a helmet in a sunlit motorsport paddock; open-wheel cars softly out of focus',
  'superhero-transformation':'an original superhero wearing a cinematic armored suit and flowing cape, overlooking a modern city at sunset',
  'luxury-photoshoot':'a luxury fashion editorial in an elegant Parisian apartment, refined tailored clothes, large windows and soft afternoon light',
  'wedding-cinematic':'the two people together at an intimate wedding ceremony in a garden, elegant wedding clothing, warm sunset light and natural expressions',
  'cyberpunk-city':'a cinematic traveler in a futuristic city at night, neon reflections on wet streets, atmospheric rain and a detailed futuristic jacket',
  'medieval-warrior':'a heroic medieval warrior in detailed practical armor in front of a stone castle, misty mountains and dramatic daylight',
  'action-hero':'an original cinematic action hero in a rugged jacket, standing on a dramatic city rooftop with an energetic skyline',
  astronaut:'an astronaut on a lunar landscape, face clearly visible inside the transparent helmet, Earth on the horizon',
  'red-carpet':'an elegant movie premiere arrival in formal clothing on a red carpet with photographers and warm flash lighting',
  'anime-transformation':'an original hand-drawn anime adventurer with recognizable facial features, expressive eyes and a richly illustrated fantasy city',
  'football-stadium':'a football player in an original unbranded kit emerging from a stadium tunnel toward a brightly lit pitch and cheering crowd',
  'future-self':'a tasteful imagined future version of the person, subtly older while still recognizable, in a sophisticated sunlit futuristic interior',
  'time-traveler':'a stylish time traveler at a magnificent clockwork station with brass machinery and a glowing portal in the distance',
  'fantasy-character':'an original fantasy adventurer in an enchanted forest with intricate clothing, luminous plants and subtle magical particles',
  'ceo-billboard':'a sophisticated professional portrait displayed on a large city billboard, seen from street level, realistic architecture and no written slogans',
  'movie-explosion':'an original action movie character confidently walking in the foreground while a clearly fictional cinematic explosion illuminates the background, no injuries or gore',
  'fashion-runway':'a high fashion runway model in original contemporary couture, dramatic runway lighting and an elegant audience out of focus',
  'travel-cinematic':'a traveler in relaxed stylish clothing overlooking a sunlit Mediterranean coastline, sea breeze and warm cinematic color',
};

/** Built from published Fal schemas. No remote request or paid generation occurs here. */
export function liveWorkflow(t:Pick<AdminTemplate,'name'|'slug'|'description'|'requiredImageCount'|'aspectRatio'|'duration'|'estimatedCost'>){
  const scene=scenes[t.slug]||`${t.name}. ${t.description}`;
  const hiddenPrompt=`Use the uploaded reference photo${t.requiredImageCount>1?'s':''} to create one polished cinematic image: ${scene}. Preserve each reference person's recognizable identity, facial structure and natural skin tone. Keep faces visible and anatomically natural. Match the requested framing. No added text, logos or watermarks. Do not impersonate an existing branded character.`;
  const base={provider:'fal',aspectRatio:t.aspectRatio,resolution:'1080p',duration:t.duration,negativePrompt:''};
  const workflow:WorkflowStep[]=[
    {...base,id:crypto.randomUUID(),type:'transform',model:'fal-ai/nano-banana/edit',prompt:'',inputs:{},output:'prepared_image',settings:{image_urls:Array.from({length:t.requiredImageCount},(_,i)=>'{{user_image_'+(i+1)+'}}'),aspect_ratio:'{{aspect_ratio}}',num_images:1,output_format:'png',limit_generations:true},cost:Math.round(t.estimatedCost*.2)},
    {...base,id:crypto.randomUUID(),type:'video',model:'fal-ai/kling-video/v2.6/pro/image-to-video',prompt:'Animate this cinematic image into a refined {{duration}}-second shot. A gentle camera push-in, subtle natural movement and atmospheric background motion. Keep faces, identities and clothing consistent with the starting image. One continuous shot. No cuts, added text, logos or dialogue.',negativePrompt:'distorted face, extra limbs, flicker, identity change, text, watermark',inputs:{start_image_url:'{{prepared_image}}'},output:'final_video',settings:{duration:'{{duration}}',generate_audio:false},cost:t.estimatedCost-Math.round(t.estimatedCost*.2)},
  ];
  return {workflow,hiddenPrompt,negativePrompt:'',provider:'fal',model:workflow[0].model,resolution:'1080p',settings:{}};
}

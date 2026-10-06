// Response shapes of the JSON API as the browser receives them. Database rows keep their snake_case column names.
import type {AdminTemplate,PublicTemplate} from './contracts';

export type Pagination={page:number;limit:number;total:number;pages:number};

export type Creation={id:string;templateName:string;templateSlug:string;thumbnail:string;status:string;creditCost:number;creditStatus:'pending'|'captured'|'released'|null;createdAt:number;startedAt:number|null;completedAt:number|null;error:string|null;assetId:string|null};
export type CreationsPage={generations:Creation[];activeCount:number;pagination:Pagination};
export type Balance={available:number;held:number};
export type CreditPackage={id:string;name:string;credits:number;bonusCredits:number;totalCredits:number;prices:Record<string,number>;active:boolean;sortOrder:number};
export type CreditPurchase={id:string;packageName:string;credits:number;amount:number;currency:string;status:'pending'|'paid'|'failed'|'reversed';provider:string;createdAt:number;paidAt:number|null;email?:string|null};
export type CreditTransaction={id:string;kind:string;reason:string|null;reference_type:string|null;reference_id:string|null;created_at:number;available_change:number;held_change:number;available_after:number|null;user_id?:string|null;email?:string|null;actor_id?:string|null};
export type CreditHistory={transactions:CreditTransaction[];pagination:Pagination};
export type Upload={id:string;name:string;mime:string;size:number;created_at:number};
export type Sessions={sessions:{current:boolean;expiresAt:number}[]};

export type Readiness={demo:boolean;ready:boolean;registrationAvailable:boolean;payments:boolean;email:boolean;ai:boolean;dispatcher:boolean;publicAccess:boolean;paymentMode:'live'|'test'|'missing';enabledProviders:string[]};
export type ConnectionStatus={readiness:Readiness;webhookUrl:string;fields:Record<string,{configured:boolean;source:'environment'|'encrypted'|'missing';value?:string}>};

export type Dashboard={users:number;demo:boolean;purchasingAvailable:boolean;generationAvailable:boolean;registrationAvailable:boolean;
 metrics:{total:number|null;completed:number|null;failed:number|null;today:number|null};
 financials:{currency:string;paid_count:number;revenue:number;estimated_cost:number;reversed_count:number;reversed_amount:number}[];
 credits:{sold:number;consumed:number;granted:number;outstanding:number};
 top:{template_name:string;count:number;credits:number}[];
 recent:{id:string;template_name:string;status:string;created_at:number;email:string|null}[];
 profitable:{name:string;currency:string;credit_cost:number;estimated_cost:number;value:number}[];
 daily:{day:string;currency:string;revenue:number;count:number}[];
 recentPurchases:{id:string;package_name:string;credits:number;amount:number;currency:string;status:string;created_at:number;email:string|null}[]};
export type Operations={demo:boolean;checkedAt:number;heartbeat:number|null;dispatchHeartbeat:number|null;dispatchSource:'cron'|'external'|null;
 queue:{status:string;count:number;oldest:number}[];
 credits:Balance;
 reversals:{id:string;package_name:string;credits:number;amount:number;currency:string;created_at:number;email:string|null;balance:number}[];
 stalled:{id:string;template_name:string;status:string;started_at:number|null;created_at:number;internal_error:string|null}[];
 storage:{bytes:number;uploads:number;assets:number;previews:number};
 checks:{name:string;ready:boolean;detail:string}[];
 events:{name:string;count:number}[];
 failures:{id:string;template_name:string;error:string|null;internal_error:string|null;completed_at:number|null;credit_status:string|null}[]};
export type ActivityPage={activity:{id:string;action:string;target_id:string|null;created_at:number;email:string|null}[];pagination:Pagination};

export type AdminTemplateRow=PublicTemplate&{estimatedCost:number;costCurrency:string;creditValue:number|null;provider:string;model:string};
export type AdminGeneration={id:string;user_id:string|null;template_name:string;credit_cost:number;currency:string;estimated_cost:number;credit_status?:string|null;status:string;created_at:number;started_at:number|null;completed_at:number|null;error:string|null;internal_error:string|null;deleted_at:number|null;email:string|null};
export type GenerationStep={id:string;step_order:number;type:string;provider:string;model:string;status:string;error:string|null};
export type AdminUser={id:string;email:string;name:string;role:string;status:string;content_strikes:number;blocked_at:number|null;email_verified:number;created_at:number;generation_count:number;purchase_count:number;credits:number;spending:{currency:string;amount:number}[]};
export type Provider={id:string;name:string;enabled:number;configured:boolean};
export type StudioSettings={welcomeCredits:number;demo:boolean;paymentsConfigured:boolean;emailConfigured:boolean;queueConfigured:boolean;dispatcher:{at:number|null;source:'cron'|'external'|null;fresh:boolean}};
export type TemplateResult={template:AdminTemplate};
export type AdminUserDetail={
 user:{id:string;name:string;email:string;role:string;status:string;email_verified:boolean;created_at:number;content_strikes:number;blocked_at:number|null};
 refusals:{id:string;template_name:string;created_at:number;reason:string|null;photos:string[]}[];
 balance:Balance;sessions:{active:number;lastSignIn:number|null};uploads:{count:number;bytes:number};
 creations:{total:number;completed:number;failed:number;recent:{id:string;template_name:string;status:string;credit_cost:number;created_at:number;completed_at:number|null;error:string|null;credit_status:string|null}[]};
 activity:{id:string;action:string;created_at:number;actor_email:string|null}[]};

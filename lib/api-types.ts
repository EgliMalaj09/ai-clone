// Response shapes of the JSON API as the browser receives them. Database rows keep their snake_case column names.
import type {AdminTemplate,PublicTemplate} from './contracts';

export type Pagination={page:number;limit:number;total:number;pages:number};

export type Creation={id:string;templateName:string;templateSlug:string;thumbnail:string;status:string;price:number;currency:string;createdAt:number;startedAt:number|null;completedAt:number|null;error:string|null;assetId:string|null;orderId:string;paymentStatus:string};
export type CreationsPage={generations:Creation[];activeCount:number;pagination:Pagination};
export type OrderRow={id:string;user_id:string|null;generation_id:string;template_name:string;amount:number;currency:string;status:string;created_at:number;generation_status:string;provider:string;provider_transaction_id:string|null;refund_status:string|null};
export type OrdersPage={orders:OrderRow[];pagination:Pagination};
export type OrderDetail={order:OrderRow&{thumbnail:string;payment_id:string;provider_session_id:string|null;checkout_url:string|null}};
export type Upload={id:string;name:string;mime:string;size:number;created_at:number};
export type Sessions={sessions:{current:boolean;expiresAt:number}[]};

export type Readiness={demo:boolean;ready:boolean;registrationAvailable:boolean;payments:boolean;email:boolean;ai:boolean;dispatcher:boolean;publicAccess:boolean;paymentMode:'live'|'test'|'missing';enabledProviders:string[]};
export type ConnectionStatus={readiness:Readiness;webhookUrl:string;fields:Record<string,{configured:boolean;source:'environment'|'encrypted'|'missing';value?:string}>};

export type Dashboard={users:number;demo:boolean;purchasingAvailable:boolean;registrationAvailable:boolean;
 metrics:{total:number|null;completed:number|null;failed:number|null;today:number|null};
 financials:{currency:string;paid_count:number;revenue:number;estimated_cost:number;refunded_count:number;refunded_amount:number}[];
 top:{template_name:string;currency:string;count:number;revenue:number}[];
 recent:{id:string;template_name:string;status:string;created_at:number;email:string|null}[];
 profitable:{name:string;price:number;estimated_cost:number;currency:string}[];
 daily:{day:string;currency:string;revenue:number;count:number}[];
 recentPayments:{id:string;template_name:string;amount:number;currency:string;status:string;created_at:number;email:string|null}[]};
export type Operations={demo:boolean;checkedAt:number;unpaid:number;heartbeat:number|null;dispatchHeartbeat:number|null;
 queue:{status:string;count:number;oldest:number}[];
 refunds:{id:string;amount:number;status:string;error:string|null;created_at:number;order_id:string;currency:string;email:string|null}[];
 stalled:{id:string;template_name:string;status:string;started_at:number|null;created_at:number;internal_error:string|null}[];
 storage:{bytes:number;uploads:number;assets:number;previews:number};
 checks:{name:string;ready:boolean;detail:string}[];
 events:{name:string;count:number}[];
 failures:{id:string;template_name:string;error:string|null;internal_error:string|null;completed_at:number|null;payment_status:string}[]};
export type ActivityPage={activity:{id:string;action:string;target_id:string|null;created_at:number;email:string|null}[];pagination:Pagination};

export type AdminTemplateRow=PublicTemplate&{estimatedCost:number;provider:string;model:string};
export type AdminGeneration={id:string;user_id:string|null;template_name:string;price:number;currency:string;estimated_cost:number;status:string;created_at:number;started_at:number|null;completed_at:number|null;error:string|null;internal_error:string|null;deleted_at:number|null;email:string|null};
export type GenerationStep={id:string;step_order:number;type:string;provider:string;model:string;status:string;error:string|null};
export type AdminOrder=OrderRow&{email:string|null;payment_id:string;provider_session_id:string|null;payment_status:string;refund_error:string|null};
export type AdminUser={id:string;email:string;name:string;role:string;status:string;email_verified:number;created_at:number;generation_count:number;order_count:number;spending:{currency:string;amount:number}[]};
export type Provider={id:string;name:string;enabled:number;configured:boolean};
export type StudioSettings={autoRefund:boolean;demo:boolean;stripeConfigured:boolean;emailConfigured:boolean;queueConfigured:boolean};
export type TemplateResult={template:AdminTemplate};

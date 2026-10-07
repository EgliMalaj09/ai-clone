import {sqliteTable,text,integer,index,uniqueIndex} from 'drizzle-orm/sqlite-core';

export const users=sqliteTable('users',{
 id:text('id').primaryKey(),email:text('email').notNull().unique(),name:text('name').notNull(),
 passwordHash:text('password_hash'),role:text('role').notNull().default('user'),status:text('status').notNull().default('active'),
 avatar:text('avatar'),emailVerified:integer('email_verified').notNull().default(0),createdAt:integer('created_at').notNull(),
 // Content refusals by the AI provider; three block uploads, creations and purchases until an admin unblocks.
 contentStrikes:integer('content_strikes').notNull().default(0),blockedAt:integer('blocked_at'),
 // Sign-up consent (C20): the Terms/Privacy version and time the customer accepted, the time they confirmed 13+ (D13),
 // and marketing-email consent with the time it was given (required before sending marketing, C20.3).
 termsVersion:text('terms_version'),termsAcceptedAt:integer('terms_accepted_at'),ageConfirmedAt:integer('age_confirmed_at'),
 marketingOptIn:integer('marketing_opt_in').notNull().default(0),marketingOptInAt:integer('marketing_opt_in_at'),
});
export const accounts=sqliteTable('accounts',{
 id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),
 provider:text('provider').notNull(),providerAccountId:text('provider_account_id').notNull(),
},t=>[uniqueIndex('idx_accounts_provider').on(t.provider,t.providerAccountId)]);
export const sessions=sqliteTable('sessions',{
 tokenHash:text('token_hash').primaryKey(),userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),expiresAt:integer('expires_at').notNull(),
},t=>[index('idx_sessions_user').on(t.userId)]);
export const authTokens=sqliteTable('auth_tokens',{
 tokenHash:text('token_hash').primaryKey(),userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),type:text('type').notNull(),expiresAt:integer('expires_at').notNull(),
});
export const templates=sqliteTable('templates',{
 id:text('id').primaryKey(),slug:text('slug').notNull().unique(),name:text('name').notNull(),description:text('description').notNull(),category:text('category').notNull(),
 thumbnail:text('thumbnail').notNull(),previewVideo:text('preview_video').notNull().default(''),previewImages:text('preview_images').notNull().default('[]'),
 active:integer('active').notNull().default(0),featured:integer('featured').notNull().default(0),trending:integer('trending').notNull().default(0),isNew:integer('is_new').notNull().default(0),popular:integer('popular').notNull().default(0),
 // Customers pay in credits (credit_cost). estimated_cost is the AI provider cost in `currency` minor units.
 estimatedCost:integer('estimated_cost').notNull().default(0),currency:text('currency').notNull().default('USD'),
 requiredImageCount:integer('required_image_count').notNull().default(1),aspectRatio:text('aspect_ratio').notNull().default('9:16'),duration:integer('duration').notNull().default(5),resolution:text('resolution').notNull().default('720p'),
 generationType:text('generation_type').notNull().default('video'),provider:text('provider').notNull().default('mock'),model:text('model').notNull().default('studio-demo'),
 hiddenPrompt:text('hidden_prompt').notNull(),negativePrompt:text('negative_prompt').notNull().default(''),settings:text('settings').notNull().default('{}'),createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull(),
 creditCost:integer('credit_cost').notNull().default(0),
},t=>[index('idx_templates_active_category').on(t.active,t.category)]);
export const templateWorkflows=sqliteTable('template_workflows',{
 id:text('id').primaryKey(),templateId:text('template_id').notNull().unique().references(()=>templates.id,{onDelete:'cascade'}),version:integer('version').notNull().default(1),
});
export const templateWorkflowSteps=sqliteTable('template_workflow_steps',{
 id:text('id').primaryKey(),workflowId:text('workflow_id').notNull().references(()=>templateWorkflows.id,{onDelete:'cascade'}),stepOrder:integer('step_order').notNull(),definition:text('definition').notNull(),
},t=>[uniqueIndex('idx_workflow_step_order').on(t.workflowId,t.stepOrder)]);
export const uploads=sqliteTable('user_uploads',{
 id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),storageKey:text('storage_key').notNull().unique(),mime:text('mime').notNull(),size:integer('size').notNull(),name:text('name').notNull(),createdAt:integer('created_at').notNull(),
},t=>[index('idx_uploads_user').on(t.userId)]);
// Studio-owned public preview media for templates. Kept apart from customer photos so quotas, privacy and account deletion never mix them.
export const templateMedia=sqliteTable('template_media',{
 id:text('id').primaryKey(),storageKey:text('storage_key').notNull().unique(),mime:text('mime').notNull(),size:integer('size').notNull(),name:text('name').notNull(),uploadedBy:text('uploaded_by').references(()=>users.id,{onDelete:'set null'}),createdAt:integer('created_at').notNull(),
});
export const generations=sqliteTable('generations',{
 id:text('id').primaryKey(),userId:text('user_id').references(()=>users.id,{onDelete:'set null'}),templateId:text('template_id').references(()=>templates.id,{onDelete:'set null'}),
 templateName:text('template_name').notNull(),templateSlug:text('template_slug').notNull(),thumbnail:text('thumbnail').notNull(),
 // The column default is historical; changing a default would force a table rebuild that cascades to steps and assets.
 // New generations always set status explicitly.
 status:text('status').notNull().default('awaiting_payment'),currency:text('currency').notNull(),estimatedCost:integer('estimated_cost').notNull(),
 workflowSnapshot:text('workflow_snapshot').notNull(),inputIds:text('input_ids').notNull(),context:text('context').notNull().default('{}'),currentStep:integer('current_step').notNull().default(0),
 leaseToken:text('lease_token'),leaseUntil:integer('lease_until').notNull().default(0),nextRunAt:integer('next_run_at').notNull().default(0),attempts:integer('attempts').notNull().default(0),error:text('error'),internalError:text('internal_error'),
 createdAt:integer('created_at').notNull(),startedAt:integer('started_at'),completedAt:integer('completed_at'),deletedAt:integer('deleted_at'),
 creditCost:integer('credit_cost').notNull().default(0),holdId:text('hold_id'),
 // Set when this generation is a free goodwill redo started from a report (C21), linking it back to the case.
 reportId:text('report_id'),
},t=>[index('idx_generations_user_date').on(t.userId,t.createdAt),index('idx_generation_queue').on(t.status,t.nextRunAt,t.leaseUntil),index('idx_generations_thumbnail').on(t.thumbnail)]);
// Customer reports on finished videos and the admin's decision (C21). One open report per video; a good photo earns one free redo.
export const generationReports=sqliteTable('generation_reports',{
 id:text('id').primaryKey(),generationId:text('generation_id').notNull().references(()=>generations.id,{onDelete:'cascade'}),userId:text('user_id').references(()=>users.id,{onDelete:'set null'}),
 reason:text('reason').notNull(),comment:text('comment').notNull().default(''),
 status:text('status').notNull().default('open'),// open | approved | rejected
 resolution:text('resolution'),// generation_problem | photo_unsuitable | other
 guideline:text('guideline'),// which photo guideline was broken, for photo_unsuitable
 adminReason:text('admin_reason'),// customer-visible reason, for other
 redoGenerationId:text('redo_generation_id'),// the free redo started on approval
 createdAt:integer('created_at').notNull(),resolvedAt:integer('resolved_at'),resolvedBy:text('resolved_by'),
},t=>[index('idx_reports_status').on(t.status,t.createdAt),index('idx_reports_generation').on(t.generationId)]);
export const generationSteps=sqliteTable('generation_steps',{
 id:text('id').primaryKey(),generationId:text('generation_id').notNull().references(()=>generations.id,{onDelete:'cascade'}),stepOrder:integer('step_order').notNull(),type:text('type').notNull(),provider:text('provider').notNull(),model:text('model').notNull(),status:text('status').notNull(),providerJobId:text('provider_job_id'),result:text('result'),error:text('error'),startedAt:integer('started_at').notNull(),completedAt:integer('completed_at'),
},t=>[uniqueIndex('idx_generation_step_order').on(t.generationId,t.stepOrder)]);
export const generatedAssets=sqliteTable('generated_assets',{
 id:text('id').primaryKey(),generationId:text('generation_id').notNull().references(()=>generations.id,{onDelete:'cascade'}),userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),storageKey:text('storage_key').notNull().unique(),mime:text('mime').notNull(),kind:text('kind').notNull(),size:integer('size').notNull(),createdAt:integer('created_at').notNull(),
},t=>[index('idx_assets_generation').on(t.generationId)]);
export const favorites=sqliteTable('favorites',{
 id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),templateId:text('template_id').notNull().references(()=>templates.id,{onDelete:'cascade'}),createdAt:integer('created_at').notNull(),
},t=>[uniqueIndex('idx_favorite_user_template').on(t.userId,t.templateId)]);
export const webhookEvents=sqliteTable('webhook_events',{id:text('id').primaryKey(),type:text('type').notNull(),processedAt:integer('processed_at').notNull()});
export const providerConfigurations=sqliteTable('provider_configurations',{id:text('id').primaryKey(),name:text('name').notNull(),enabled:integer('enabled').notNull().default(0),settings:text('settings').notNull().default('{}'),updatedAt:integer('updated_at').notNull()});
export const settings=sqliteTable('app_settings',{key:text('key').primaryKey(),value:text('value').notNull()});
export const analyticsEvents=sqliteTable('analytics_events',{id:text('id').primaryKey(),userId:text('user_id'),name:text('name').notNull(),metadata:text('metadata').notNull().default('{}'),createdAt:integer('created_at').notNull()},t=>[index('idx_events_name_time').on(t.name,t.createdAt)]);
export const rateLimits=sqliteTable('rate_limits',{key:text('key').primaryKey(),count:integer('count').notNull(),resetAt:integer('reset_at').notNull()});
export const auditLogs=sqliteTable('audit_logs',{id:text('id').primaryKey(),userId:text('user_id'),action:text('action').notNull(),targetId:text('target_id'),createdAt:integer('created_at').notNull()});

// Credits. See docs/CREDITS-ARCHITECTURE.md. Balances change only through credit transactions, whose entries sum to zero.
export const creditBalances=sqliteTable('credit_balances',{
 userId:text('user_id').primaryKey().references(()=>users.id,{onDelete:'cascade'}),available:integer('available').notNull().default(0),held:integer('held').notNull().default(0),version:integer('version').notNull().default(0),
 // The transaction that last changed this balance; statements in the same batch check it to know the change applied.
 lastTransactionId:text('last_transaction_id'),updatedAt:integer('updated_at').notNull(),
});
// Ledger rows keep the user id without a foreign key, so financial history survives account deletion.
export const creditTransactions=sqliteTable('credit_transactions',{
 id:text('id').primaryKey(),kind:text('kind').notNull(),idempotencyKey:text('idempotency_key').notNull().unique(),userId:text('user_id'),referenceType:text('reference_type'),referenceId:text('reference_id'),actorId:text('actor_id'),reason:text('reason'),createdAt:integer('created_at').notNull(),
},t=>[index('idx_credit_transactions_user').on(t.userId,t.createdAt)]);
export const creditEntries=sqliteTable('credit_entries',{
 id:text('id').primaryKey(),transactionId:text('transaction_id').notNull().references(()=>creditTransactions.id),account:text('account').notNull(),amount:integer('amount').notNull(),balanceAfter:integer('balance_after'),createdAt:integer('created_at').notNull(),
},t=>[index('idx_credit_entries_transaction').on(t.transactionId),index('idx_credit_entries_account').on(t.account)]);
export const creditHolds=sqliteTable('credit_holds',{
 id:text('id').primaryKey(),userId:text('user_id').notNull(),generationId:text('generation_id').notNull(),amount:integer('amount').notNull(),status:text('status').notNull().default('pending'),createdAt:integer('created_at').notNull(),settledAt:integer('settled_at'),
},t=>[index('idx_credit_holds_status').on(t.status),index('idx_credit_holds_generation').on(t.generationId)]);
export const creditPackages=sqliteTable('credit_packages',{
 id:text('id').primaryKey(),name:text('name').notNull(),credits:integer('credits').notNull(),bonusCredits:integer('bonus_credits').notNull().default(0),prices:text('prices').notNull().default('{}'),active:integer('active').notNull().default(0),sortOrder:integer('sort_order').notNull().default(0),createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull(),
});
export const creditPurchases=sqliteTable('credit_purchases',{
 id:text('id').primaryKey(),userId:text('user_id').references(()=>users.id,{onDelete:'set null'}),packageId:text('package_id').notNull(),packageName:text('package_name').notNull(),credits:integer('credits').notNull(),amount:integer('amount').notNull(),currency:text('currency').notNull(),
 status:text('status').notNull().default('pending'),provider:text('provider').notNull(),providerSessionId:text('provider_session_id').unique(),providerTransactionId:text('provider_transaction_id'),checkoutUrl:text('checkout_url'),checkoutAttempt:integer('checkout_attempt').notNull().default(0),
 idempotencyKey:text('idempotency_key').notNull(),createdAt:integer('created_at').notNull(),paidAt:integer('paid_at'),
},t=>[uniqueIndex('idx_credit_purchase_idempotency').on(t.userId,t.idempotencyKey),index('idx_credit_purchases_user').on(t.userId,t.createdAt)]);

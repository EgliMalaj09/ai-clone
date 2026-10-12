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
 // Two-step sign-in (C4.1): encrypted TOTP secret (and one being set up), when it was turned on, the last code step used
 // (no code works twice) and hashes of the one-time recovery codes.
 // Language for emails (C10): the one the customer last used on the site.
 locale:text('locale').notNull().default('sq'),
 // Referrals (V4): this customer's invite code, and who invited them.
 referralCode:text('referral_code').unique(),referredBy:text('referred_by'),
 // Email change waiting for confirmation from the new address (V18).
 pendingEmail:text('pending_email'),
 totpSecret:text('totp_secret'),totpPending:text('totp_pending'),totpEnabledAt:integer('totp_enabled_at'),totpLastStep:integer('totp_last_step').notNull().default(0),totpRecovery:text('totp_recovery').notNull().default('[]'),
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
 // Extra photo tips for this template only (C31.4), one per line, shown under the studio-wide guidelines.
 photoTips:text('photo_tips').notNull().default(''),
 // Catalog management (V13/V14): manual order (lower first), a scheduled publish time, and archive instead of delete.
 sortOrder:integer('sort_order').notNull().default(0),publishAt:integer('publish_at'),archivedAt:integer('archived_at'),
 // Template options (V22/V23/V37): choices the customer picks (style, format, quality) that change the prompt, format, model and price.
 options:text('options').notNull().default('[]'),
 // What the customer photographs (V39): a person (face rules) or a product (product photo rules).
 subject:text('subject').notNull().default('person'),
},t=>[index('idx_templates_active_category').on(t.active,t.category)]);
export const templateWorkflows=sqliteTable('template_workflows',{
 id:text('id').primaryKey(),templateId:text('template_id').notNull().unique().references(()=>templates.id,{onDelete:'cascade'}),version:integer('version').notNull().default(1),
});
export const templateWorkflowSteps=sqliteTable('template_workflow_steps',{
 id:text('id').primaryKey(),workflowId:text('workflow_id').notNull().references(()=>templateWorkflows.id,{onDelete:'cascade'}),stepOrder:integer('step_order').notNull(),definition:text('definition').notNull(),
},t=>[uniqueIndex('idx_workflow_step_order').on(t.workflowId,t.stepOrder)]);
export const uploads=sqliteTable('user_uploads',{
 id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),storageKey:text('storage_key').notNull().unique(),mime:text('mime').notNull(),size:integer('size').notNull(),name:text('name').notNull(),createdAt:integer('created_at').notNull(),
 // Saved photos (V17): kept for reuse (not swept after 24 h), with a label like "Me" and one default photo.
 savedAt:integer('saved_at'),label:text('label'),isDefault:integer('is_default').notNull().default(0),
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
 // Ratings and the public gallery/feed (V6/V40): the customer's 1–5 rating and, only if they choose, when the video was made public.
 rating:integer('rating'),ratedAt:integer('rated_at'),publicAt:integer('public_at'),likes:integer('likes').notNull().default(0),
 // Free admin test run (V32): real AI, no credits reserved or charged, no content strike.
 testRun:integer('test_run').notNull().default(0),
 // The options the customer picked for this video (V22), so it can be shown and made again the same way.
 options:text('options').notNull().default('{}'),
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
 // Recorded AI cost of this step (V15), in USD cents: what the provider reported, else the step's listed price.
 cost:integer('cost'),costSource:text('cost_source'),
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
 // Promo code applied at checkout (V4): the code and the price before the discount.
 promoCode:text('promo_code'),fullAmount:integer('full_amount'),
 // Gift purchase (V28): the credits go to a one-time code emailed to the recipient instead of the buyer.
 giftEmail:text('gift_email'),giftName:text('gift_name'),giftMessage:text('gift_message'),giftCode:text('gift_code'),
},t=>[uniqueIndex('idx_credit_purchase_idempotency').on(t.userId,t.idempotencyKey),index('idx_credit_purchases_user').on(t.userId,t.createdAt)]);
// Server errors and provider/webhook failures (C7), shown in Admin → Operations and kept 30 days; also forwarded to Sentry when SENTRY_DSN is set.
export const errorEvents=sqliteTable('error_events',{
 id:text('id').primaryKey(),source:text('source').notNull(),level:text('level').notNull().default('error'),message:text('message').notNull(),detail:text('detail').notNull().default(''),
 context:text('context').notNull().default('{}'),createdAt:integer('created_at').notNull(),
},t=>[index('idx_error_events_created').on(t.createdAt)]);
// Share links (V3): a public page /v/<id> for one finished video; the owner can stop sharing at any time.
export const shareLinks=sqliteTable('share_links',{
 id:text('id').primaryKey(),generationId:text('generation_id').notNull().references(()=>generations.id,{onDelete:'cascade'}),userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),
 createdAt:integer('created_at').notNull(),revokedAt:integer('revoked_at'),views:integer('views').notNull().default(0),
},t=>[index('idx_share_generation').on(t.generationId)]);
// Removal requests (V30): someone shown in a video without agreeing asks for it to be taken down.
export const removalRequests=sqliteTable('removal_requests',{
 id:text('id').primaryKey(),generationId:text('generation_id').references(()=>generations.id,{onDelete:'set null'}),shareId:text('share_id'),videoReference:text('video_reference').notNull(),
 name:text('name').notNull(),email:text('email').notNull(),relation:text('relation').notNull(),details:text('details').notNull(),locale:text('locale').notNull().default('sq'),
 status:text('status').notNull().default('open'),// open | removed | kept
 adminNote:text('admin_note'),createdAt:integer('created_at').notNull(),resolvedAt:integer('resolved_at'),resolvedBy:text('resolved_by'),
},t=>[index('idx_removals_status').on(t.status,t.createdAt)]);
// Template history (V33): every saved version of a template's prompt and workflow, to compare and roll back.
export const templateVersions=sqliteTable('template_versions',{
 id:text('id').primaryKey(),templateId:text('template_id').notNull().references(()=>templates.id,{onDelete:'cascade'}),
 snapshot:text('snapshot').notNull(),createdAt:integer('created_at').notNull(),createdBy:text('created_by'),
},t=>[index('idx_template_versions').on(t.templateId,t.createdAt)]);
// Announcements (V36/V29): emails to customers who opted in to news (C20.3), sent by the dispatcher in small batches.
export const announcements=sqliteTable('announcements',{
 id:text('id').primaryKey(),subjectSq:text('subject_sq').notNull(),bodySq:text('body_sq').notNull(),subjectEn:text('subject_en').notNull(),bodyEn:text('body_en').notNull(),
 link:text('link'),linkLabel:text('link_label'),templateId:text('template_id'),
 status:text('status').notNull().default('sending'),// sending | sent | cancelled
 total:integer('total').notNull().default(0),sent:integer('sent').notNull().default(0),cursor:text('cursor').notNull().default(''),
 createdBy:text('created_by'),createdAt:integer('created_at').notNull(),finishedAt:integer('finished_at'),
});
// Template ideas (V43): customers suggest templates and vote; the admin marks them planned, done or declined.
export const templateRequests=sqliteTable('template_requests',{
 id:text('id').primaryKey(),userId:text('user_id').references(()=>users.id,{onDelete:'set null'}),title:text('title').notNull(),details:text('details').notNull().default(''),
 status:text('status').notNull().default('open'),// open | planned | done | declined
 votes:integer('votes').notNull().default(1),templateId:text('template_id'),createdAt:integer('created_at').notNull(),
},t=>[index('idx_template_requests').on(t.status,t.votes)]);
export const templateRequestVotes=sqliteTable('template_request_votes',{
 requestId:text('request_id').notNull().references(()=>templateRequests.id,{onDelete:'cascade'}),userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),createdAt:integer('created_at').notNull(),
},t=>[uniqueIndex('idx_template_request_vote').on(t.requestId,t.userId)]);
// Likes on public videos (V40), one per customer and video.
export const feedLikes=sqliteTable('feed_likes',{
 generationId:text('generation_id').notNull().references(()=>generations.id,{onDelete:'cascade'}),userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),createdAt:integer('created_at').notNull(),
},t=>[uniqueIndex('idx_feed_like').on(t.generationId,t.userId)]);
// Promo codes (V4): a code gives credits when redeemed, or a percentage off a credit pack at checkout.
export const promoCodes=sqliteTable('promo_codes',{
 id:text('id').primaryKey(),code:text('code').notNull().unique(),kind:text('kind').notNull(),// credits | discount
 credits:integer('credits').notNull().default(0),percent:integer('percent').notNull().default(0),maxUses:integer('max_uses'),uses:integer('uses').notNull().default(0),
 expiresAt:integer('expires_at'),active:integer('active').notNull().default(1),note:text('note').notNull().default(''),createdBy:text('created_by'),createdAt:integer('created_at').notNull(),
});
export const promoRedemptions=sqliteTable('promo_redemptions',{
 id:text('id').primaryKey(),codeId:text('code_id').notNull().references(()=>promoCodes.id,{onDelete:'cascade'}),userId:text('user_id').references(()=>users.id,{onDelete:'set null'}),purchaseId:text('purchase_id'),createdAt:integer('created_at').notNull(),
},t=>[uniqueIndex('idx_promo_redemption_user').on(t.codeId,t.userId)]);
// Provider invoices (V15): the real monthly bill per AI provider, compared with the recorded cost of the videos.
export const providerInvoices=sqliteTable('provider_invoices',{
 id:text('id').primaryKey(),provider:text('provider').notNull(),month:text('month').notNull(),amount:integer('amount').notNull(),note:text('note').notNull().default(''),createdAt:integer('created_at').notNull(),
},t=>[uniqueIndex('idx_provider_invoice_month').on(t.provider,t.month)]);
// A/B tests (V16): a second preview or credit cost for one template, shown to half of the signed-in customers.
export const templateExperiments=sqliteTable('template_experiments',{
 id:text('id').primaryKey(),templateId:text('template_id').notNull().references(()=>templates.id,{onDelete:'cascade'}),kind:text('kind').notNull(),// preview | price
 thumbnailB:text('thumbnail_b'),previewVideoB:text('preview_video_b'),creditCostB:integer('credit_cost_b'),
 status:text('status').notNull().default('running'),startedAt:integer('started_at').notNull(),endedAt:integer('ended_at'),createdBy:text('created_by'),
},t=>[index('idx_experiments_template').on(t.templateId,t.status)]);

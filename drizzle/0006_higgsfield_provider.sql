-- Register Higgsfield as an AI provider in existing databases (new databases get it from the seed). Disabled until its key is saved.
INSERT OR IGNORE INTO `provider_configurations` (`id`,`name`,`enabled`,`settings`,`updated_at`) VALUES ('higgsfield','Higgsfield',0,'{}',0);

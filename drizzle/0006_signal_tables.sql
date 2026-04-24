CREATE TABLE `signalTemplates` (
	`id` varchar(64) NOT NULL,
	`signalType` varchar(128) NOT NULL,
	`name` varchar(255) NOT NULL,
	`category` varchar(64) NOT NULL,
	`description` text,
	`direction` varchar(32) NOT NULL,
	`defaultWindow` varchar(32),
	`defaultThresholdText` varchar(255),
	`severityRule` text,
	`source` varchar(64) NOT NULL,
	`isEnabled` boolean NOT NULL DEFAULT true,
	`priority` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `signalTemplates_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_signal_templates_signal_type` UNIQUE(`signalType`)
);
--> statement-breakpoint
CREATE TABLE `signalEvents` (
	`id` varchar(64) NOT NULL,
	`signalType` varchar(128) NOT NULL,
	`tokenId` bigint NOT NULL,
	`symbol` varchar(32) NOT NULL,
	`title` varchar(255) NOT NULL,
	`summary` text,
	`category` varchar(64) NOT NULL,
	`direction` varchar(32) NOT NULL,
	`window` varchar(32),
	`severity` enum('low','medium','high') NOT NULL,
	`status` enum('new','active','muted','expired') NOT NULL DEFAULT 'new',
	`source` varchar(64) NOT NULL,
	`triggeredAt` timestamp NOT NULL,
	`expiresAt` timestamp,
	`dedupeKey` varchar(255) NOT NULL,
	`latestMetricValue` decimal(36,12),
	`baselineValue` decimal(36,12),
	`thresholdValue` decimal(36,12),
	`changePct` decimal(18,6),
	`payloadJson` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `signalEvents_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_signal_events_dedupe_key` UNIQUE(`dedupeKey`)
);
--> statement-breakpoint
CREATE TABLE `signalEventMetrics` (
	`id` varchar(64) NOT NULL,
	`signalEventId` varchar(64) NOT NULL,
	`metricKey` varchar(128) NOT NULL,
	`metricLabel` varchar(255) NOT NULL,
	`metricValue` decimal(36,12),
	`metricUnit` varchar(32),
	`baselineValue` decimal(36,12),
	`thresholdValue` decimal(36,12),
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `signalEventMetrics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `signalEventActions` (
	`id` varchar(64) NOT NULL,
	`signalEventId` varchar(64) NOT NULL,
	`actionType` enum('mark_active','mute','unmute','expire','reopen') NOT NULL,
	`fromStatus` enum('new','active','muted','expired'),
	`toStatus` enum('new','active','muted','expired'),
	`operatorOpenId` varchar(64),
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `signalEventActions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_signal_templates_category` ON `signalTemplates` (`category`);
--> statement-breakpoint
CREATE INDEX `idx_signal_templates_enabled` ON `signalTemplates` (`isEnabled`);
--> statement-breakpoint
CREATE INDEX `idx_signal_events_symbol` ON `signalEvents` (`symbol`);
--> statement-breakpoint
CREATE INDEX `idx_signal_events_token_id` ON `signalEvents` (`tokenId`);
--> statement-breakpoint
CREATE INDEX `idx_signal_events_signal_type` ON `signalEvents` (`signalType`);
--> statement-breakpoint
CREATE INDEX `idx_signal_events_status` ON `signalEvents` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_signal_events_triggered_at` ON `signalEvents` (`triggeredAt`);
--> statement-breakpoint
CREATE INDEX `idx_signal_events_status_triggered_at` ON `signalEvents` (`status`,`triggeredAt`);
--> statement-breakpoint
CREATE INDEX `idx_signal_events_type_triggered_at` ON `signalEvents` (`signalType`,`triggeredAt`);
--> statement-breakpoint
CREATE INDEX `idx_signal_event_metrics_event_id` ON `signalEventMetrics` (`signalEventId`);
--> statement-breakpoint
CREATE INDEX `idx_signal_event_metrics_metric_key` ON `signalEventMetrics` (`metricKey`);
--> statement-breakpoint
CREATE INDEX `idx_signal_event_actions_event_id` ON `signalEventActions` (`signalEventId`);
--> statement-breakpoint
CREATE INDEX `idx_signal_event_actions_created_at` ON `signalEventActions` (`createdAt`);

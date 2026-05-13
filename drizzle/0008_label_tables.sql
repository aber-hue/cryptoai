CREATE TABLE `labelAnalysisRuns` (
  `runId` varchar(64) NOT NULL,
  `tokenId` bigint NOT NULL,
  `chain` varchar(64) NOT NULL,
  `symbol` varchar(32) NOT NULL,
  `triggeredBy` varchar(64) NOT NULL,
  `status` enum('running','success','failed') NOT NULL,
  `proposalCount` int NOT NULL DEFAULT 0,
  `approvedCount` int NOT NULL DEFAULT 0,
  `rejectedCount` int NOT NULL DEFAULT 0,
  `configJson` text NOT NULL,
  `sourceSummaryJson` text,
  `errorMessage` text,
  `startedAt` timestamp NOT NULL,
  `finishedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `labelAnalysisRuns_runId` PRIMARY KEY(`runId`)
);
--> statement-breakpoint
CREATE INDEX `idx_label_runs_token_started` ON `labelAnalysisRuns` (`tokenId`,`startedAt`);
--> statement-breakpoint
CREATE INDEX `idx_label_runs_status_started` ON `labelAnalysisRuns` (`status`,`startedAt`);
--> statement-breakpoint
CREATE INDEX `idx_label_runs_symbol_started` ON `labelAnalysisRuns` (`symbol`,`startedAt`);
--> statement-breakpoint
CREATE TABLE `addressLabelProposals` (
  `id` varchar(64) NOT NULL,
  `runId` varchar(64) NOT NULL,
  `tokenId` bigint NOT NULL,
  `chain` varchar(64) NOT NULL,
  `address` varchar(128) NOT NULL,
  `proposedLabel` varchar(64) NOT NULL,
  `proposedSubtype` varchar(64),
  `proposedTagsJson` text,
  `confidence` decimal(6,4) NOT NULL,
  `detector` varchar(64) NOT NULL,
  `stage` enum('bootstrap','downstream','behavior','sink','cluster') NOT NULL,
  `reasonSummary` text NOT NULL,
  `evidenceJson` text NOT NULL,
  `reviewStatus` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `reviewer` varchar(64),
  `reviewedAt` timestamp NULL,
  `reviewSubtype` varchar(64),
  `reviewTagsJson` text,
  `reviewNote` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `addressLabelProposals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_label_proposals_run_review` ON `addressLabelProposals` (`runId`,`reviewStatus`);
--> statement-breakpoint
CREATE INDEX `idx_label_proposals_token_chain_address` ON `addressLabelProposals` (`tokenId`,`chain`,`address`);
--> statement-breakpoint
CREATE INDEX `idx_label_proposals_label` ON `addressLabelProposals` (`proposedLabel`);
--> statement-breakpoint
CREATE TABLE `addressLabels` (
  `id` varchar(64) NOT NULL,
  `tokenId` bigint NOT NULL,
  `chain` varchar(64) NOT NULL,
  `address` varchar(128) NOT NULL,
  `label` varchar(64) NOT NULL,
  `subtype` varchar(64),
  `tagsJson` text,
  `confidence` decimal(6,4) NOT NULL,
  `sourceProposalId` varchar(64) NOT NULL,
  `approvedBy` varchar(64) NOT NULL,
  `approvedAt` timestamp NOT NULL,
  `supersededBy` varchar(64),
  `isActive` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `addressLabels_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_address_labels_token_chain_active` ON `addressLabels` (`tokenId`,`chain`,`isActive`);
--> statement-breakpoint
CREATE INDEX `idx_address_labels_token_label_active` ON `addressLabels` (`tokenId`,`label`,`isActive`);
--> statement-breakpoint
CREATE INDEX `idx_address_labels_chain_address` ON `addressLabels` (`chain`,`address`);

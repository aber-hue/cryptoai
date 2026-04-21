CREATE TABLE `chatConversations` (
	`id` varchar(64) NOT NULL,
	`ownerOpenId` varchar(64),
	`title` varchar(255) NOT NULL,
	`detectedSymbol` varchar(32),
	`taskType` varchar(64) NOT NULL,
	`summary` text,
	`stateJson` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `chatConversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chatMessages` (
	`id` varchar(64) NOT NULL,
	`conversationId` varchar(64) NOT NULL,
	`role` enum('system','user','assistant') NOT NULL,
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chatMessages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chatArtifacts` (
	`id` varchar(64) NOT NULL,
	`conversationId` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`type` enum('report','table','csv') NOT NULL,
	`status` enum('ready','generating') NOT NULL,
	`summary` text,
	`content` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `chatArtifacts_id` PRIMARY KEY(`id`)
);

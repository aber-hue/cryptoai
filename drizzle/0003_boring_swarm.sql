CREATE TABLE `addressHoldings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`coinId` varchar(64) NOT NULL,
	`address` varchar(128) NOT NULL,
	`balance` bigint NOT NULL,
	`percentageOfCirculating` int,
	`isExchange` boolean NOT NULL DEFAULT false,
	`exchangeId` varchar(64),
	`label` varchar(256),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `addressHoldings_id` PRIMARY KEY(`id`)
);

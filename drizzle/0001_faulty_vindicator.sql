CREATE TABLE `activities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`coinId` varchar(64) NOT NULL,
	`exchangeId` varchar(64) NOT NULL,
	`title` varchar(512) NOT NULL,
	`content` text,
	`url` text,
	`publishTime` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `activities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `coins` (
	`id` varchar(64) NOT NULL,
	`symbol` varchar(32) NOT NULL,
	`name` varchar(128) NOT NULL,
	`description` text,
	`logoUrl` text,
	`website` text,
	`whitepaperUrl` text,
	`currentPrice` bigint,
	`marketCap` bigint,
	`fdv` bigint,
	`totalSupply` bigint,
	`circulatingSupply` bigint,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `coins_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `exchanges` (
	`id` varchar(64) NOT NULL,
	`name` varchar(128) NOT NULL,
	`logoUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `exchanges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `listings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`coinId` varchar(64) NOT NULL,
	`exchangeId` varchar(64) NOT NULL,
	`hasSpot` boolean NOT NULL DEFAULT false,
	`hasFutures` boolean NOT NULL DEFAULT false,
	`spotListingTime` timestamp,
	`futuresListingTime` timestamp,
	`listingPrice` bigint,
	`listingVolume24h` bigint,
	`listingCirculatingSupply` bigint,
	`listingFdv` bigint,
	`currentVolume24h` bigint,
	`currentDepthUp2` bigint,
	`currentDepthDown2` bigint,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `listings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tokenUnlocks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`coinId` varchar(64) NOT NULL,
	`unlockDate` timestamp NOT NULL,
	`unlockAmount` bigint NOT NULL,
	`percentageOfTotalSupply` int,
	`recipientCategory` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tokenUnlocks_id` PRIMARY KEY(`id`)
);

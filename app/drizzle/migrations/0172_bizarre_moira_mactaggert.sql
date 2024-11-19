ALTER TABLE `PaypalTransaction` ADD `type` enum('REP_PURCHASE','REFERRAL') DEFAULT 'REP_PURCHASE' NOT NULL;
UPDATE `PaypalTransaction` SET `type` = 'REFERRAL' WHERE `amount` = 0;<
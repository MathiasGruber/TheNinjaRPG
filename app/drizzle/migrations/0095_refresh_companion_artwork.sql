-- Attach every generated candidate to its current owner for normal upload cleanup.
-- Existing uploads are retained; deterministic IDs make replay harmless.
INSERT INTO `UserUpload` (`id`, `userId`, `imageUrl`)
SELECT asset.`uploadId`, p.`userId`, asset.`imageUrl`
FROM (
SELECT 'AqsIKC1oMOh9-2xaeS3un' AS `petId`, 'pet-art-0094-AqsIKC1oMOh9-2xaeS3un-1' AS `uploadId`, 'https://ui0arpl8sm.ufs.sh/f/content-HwQhCqffkPRnJI-pJ6587.webp' AS `imageUrl`
UNION ALL
SELECT 'Ivd0F8vG2tsfeBOAH_93B', 'pet-art-0094-Ivd0F8vG2tsfeBOAH_93B-1', 'https://ui0arpl8sm.ufs.sh/f/content-PxreIpb8jO2lOXhGfQ4Vg.webp'
UNION ALL
SELECT '-aNSAAxO74C1dN7rGX0vv', 'pet-art-0094--aNSAAxO74C1dN7rGX0vv-1', 'https://ui0arpl8sm.ufs.sh/f/content-Ogud4KfB3X6uExCsPZHhQ.webp'
UNION ALL
SELECT 'SCb3Q_ltFIBJVdU9pr56Y', 'pet-art-0094-SCb3Q_ltFIBJVdU9pr56Y-1', 'https://ui0arpl8sm.ufs.sh/f/content-osqgArK0TaRVIfSjHdVlh.webp'
UNION ALL
SELECT '5YbKe-vjTXn8CqdoJ1wHg', 'pet-art-0094-5YbKe-vjTXn8CqdoJ1wHg-1', 'https://ui0arpl8sm.ufs.sh/f/content-wN4SsKbxJ1p1c8xWQM-aN.webp'
UNION ALL
SELECT '5YbKe-vjTXn8CqdoJ1wHg', 'pet-art-0094-5YbKe-vjTXn8CqdoJ1wHg-2', 'https://ui0arpl8sm.ufs.sh/f/content-yg1Z2pNv62NG4k5zA25ZC.webp'
UNION ALL
SELECT 'vobciAWGlIiQ0RQ843kum', 'pet-art-0094-vobciAWGlIiQ0RQ843kum-1', 'https://ui0arpl8sm.ufs.sh/f/content-KBb-b7FgqhxeKBXofzfNU.webp'
UNION ALL
SELECT 'vobciAWGlIiQ0RQ843kum', 'pet-art-0094-vobciAWGlIiQ0RQ843kum-2', 'https://ui0arpl8sm.ufs.sh/f/content-CZAT1Wul3N6PD-jaKpLAI.webp'
UNION ALL
SELECT 'baJynPfcWPLAJqeN9CPWa', 'pet-art-0094-baJynPfcWPLAJqeN9CPWa-1', 'https://ui0arpl8sm.ufs.sh/f/content-IS-TYLDablB3HRyPTIXh9.webp'
UNION ALL
SELECT '3Rj_VFVgvPLbIdZwTZ37i', 'pet-art-0094-3Rj_VFVgvPLbIdZwTZ37i-1', 'https://ui0arpl8sm.ufs.sh/f/content-ENT9Nt_ZCCG8hy5C1iy7L.webp'
UNION ALL
SELECT 'PeiCYP2jmIqAFCuqqVBa6', 'pet-art-0094-PeiCYP2jmIqAFCuqqVBa6-1', 'https://ui0arpl8sm.ufs.sh/f/content-Dq-TA2qjSqKG1vIXfZud-.webp'
UNION ALL
SELECT 'MVIRJlnstuUn57Fl6b3Ts', 'pet-art-0094-MVIRJlnstuUn57Fl6b3Ts-1', 'https://ui0arpl8sm.ufs.sh/f/content--Zlrhzl7U3KfYHxJ4S1En.webp'
UNION ALL
SELECT '2IdSFu_QVby2n7jduGyi0', 'pet-art-0094-2IdSFu_QVby2n7jduGyi0-1', 'https://ui0arpl8sm.ufs.sh/f/content-Ivooiwrysj6k202-0Rhm8.webp'
UNION ALL
SELECT '2IdSFu_QVby2n7jduGyi0', 'pet-art-0094-2IdSFu_QVby2n7jduGyi0-2', 'https://ui0arpl8sm.ufs.sh/f/content-PZLG2YKtUaBS7zCNvqXqQ.webp'
UNION ALL
SELECT '2IdSFu_QVby2n7jduGyi0', 'pet-art-0094-2IdSFu_QVby2n7jduGyi0-3', 'https://ui0arpl8sm.ufs.sh/f/content-MSSxWO1VinSUbgGJNHdwP.webp'
UNION ALL
SELECT '2IdSFu_QVby2n7jduGyi0', 'pet-art-0094-2IdSFu_QVby2n7jduGyi0-4', 'https://ui0arpl8sm.ufs.sh/f/content-gUCtbma2tV9wNHm_8mHR9.webp'
UNION ALL
SELECT 'ikwZ6gsGLRMEDBaifsZID', 'pet-art-0094-ikwZ6gsGLRMEDBaifsZID-1', 'https://ui0arpl8sm.ufs.sh/f/content-Esca1nU3Mo1rd3P3-kZf8.webp'
UNION ALL
SELECT 'WFOtZOlQT4t7b_SJ2szxD', 'pet-art-0094-WFOtZOlQT4t7b_SJ2szxD-1', 'https://ui0arpl8sm.ufs.sh/f/content-rTJg6HayW8bRXk5E39FI6.webp'
UNION ALL
SELECT 'WFOtZOlQT4t7b_SJ2szxD', 'pet-art-0094-WFOtZOlQT4t7b_SJ2szxD-2', 'https://ui0arpl8sm.ufs.sh/f/content-HFJvv5t34D4QNIepgW62R.webp'
UNION ALL
SELECT 'WFOtZOlQT4t7b_SJ2szxD', 'pet-art-0094-WFOtZOlQT4t7b_SJ2szxD-3', 'https://ui0arpl8sm.ufs.sh/f/content-KRAf_YTL2aVz6-2yyCjOG.webp'
UNION ALL
SELECT 'rhPU3ryVelwum0lBBruVu', 'pet-art-0094-rhPU3ryVelwum0lBBruVu-1', 'https://ui0arpl8sm.ufs.sh/f/content-04CzxdkRoh-GcJz48zGSu.webp'
UNION ALL
SELECT 'rhPU3ryVelwum0lBBruVu', 'pet-art-0094-rhPU3ryVelwum0lBBruVu-2', 'https://ui0arpl8sm.ufs.sh/f/content-C4aawo4IWf0vDi50s5ZTs.webp'
UNION ALL
SELECT 'zeZjO2-DegzGpAiFgszy-', 'pet-art-0094-zeZjO2-DegzGpAiFgszy--1', 'https://ui0arpl8sm.ufs.sh/f/content-2bKGuppbDh1iLLc0Vn3hO.webp'
UNION ALL
SELECT '-hxRymsvVCRNZsBL48BpC', 'pet-art-0094--hxRymsvVCRNZsBL48BpC-1', 'https://ui0arpl8sm.ufs.sh/f/content-cciC7jWhMFed_Df2loLuB.webp'
UNION ALL
SELECT '-hxRymsvVCRNZsBL48BpC', 'pet-art-0094--hxRymsvVCRNZsBL48BpC-2', 'https://ui0arpl8sm.ufs.sh/f/content-TSRYTMkfnOoLYq1mvPrrJ.webp'
UNION ALL
SELECT 'amCit2-YlBbDvo0JuRDpP', 'pet-art-0094-amCit2-YlBbDvo0JuRDpP-1', 'https://ui0arpl8sm.ufs.sh/f/content-1-js_4-VkcrBMvQCoz13q.webp'
UNION ALL
SELECT 'JdTnXgURYCcqwMjGLOOq-', 'pet-art-0094-JdTnXgURYCcqwMjGLOOq--1', 'https://ui0arpl8sm.ufs.sh/f/content-G5-GvU15sEM6bwhSsbjBr.webp'
UNION ALL
SELECT 'JdTnXgURYCcqwMjGLOOq-', 'pet-art-0094-JdTnXgURYCcqwMjGLOOq--2', 'https://ui0arpl8sm.ufs.sh/f/content-q9Uh8sAcIWV2h99jAyGra.webp'
UNION ALL
SELECT 'JdTnXgURYCcqwMjGLOOq-', 'pet-art-0094-JdTnXgURYCcqwMjGLOOq--3', 'https://ui0arpl8sm.ufs.sh/f/content-OlUXL1-OyWD9mHFdKo_Y4.webp'
UNION ALL
SELECT 'JdTnXgURYCcqwMjGLOOq-', 'pet-art-0094-JdTnXgURYCcqwMjGLOOq--4', 'https://ui0arpl8sm.ufs.sh/f/content-7V9mySGuX3B2KJkw0vZYB.webp'
UNION ALL
SELECT 'Gd-esR0BFbCB9lhA-342r', 'pet-art-0094-Gd-esR0BFbCB9lhA-342r-1', 'https://ui0arpl8sm.ufs.sh/f/content-oVdm_QGQ-2guYP1KmTimV.webp'
UNION ALL
SELECT 'Gd-esR0BFbCB9lhA-342r', 'pet-art-0094-Gd-esR0BFbCB9lhA-342r-2', 'https://ui0arpl8sm.ufs.sh/f/content-vWeKLzTBlJK6WGtBUH4QY.webp'
UNION ALL
SELECT 'Gd-esR0BFbCB9lhA-342r', 'pet-art-0094-Gd-esR0BFbCB9lhA-342r-3', 'https://ui0arpl8sm.ufs.sh/f/content-AMnXALgC4YOI2KBKqYm1D.webp'
UNION ALL
SELECT 'LCvxge76Ii8CStZJRBBGl', 'pet-art-0094-LCvxge76Ii8CStZJRBBGl-1', 'https://ui0arpl8sm.ufs.sh/f/content-YGSQFPkEyHmj3D8O2DXLt.webp'
UNION ALL
SELECT 'v2LTHzHPCPAC6U6zQL2Yy', 'pet-art-0094-v2LTHzHPCPAC6U6zQL2Yy-1', 'https://ui0arpl8sm.ufs.sh/f/content-5eBn8PCvejllflQHfluP4.webp'
UNION ALL
SELECT 'yG8kb9--FuRQw9_fY3sn-', 'pet-art-0094-yG8kb9--FuRQw9_fY3sn--1', 'https://ui0arpl8sm.ufs.sh/f/content-upFANaW_zgM9Ol5dFjdC1.webp'
UNION ALL
SELECT 'e3ku_jkAY33mXZYr9mDEK', 'pet-art-0094-e3ku_jkAY33mXZYr9mDEK-1', 'https://ui0arpl8sm.ufs.sh/f/content-WzczJmovLC4MTMoDCmWfK.webp'
UNION ALL
SELECT 'e3ku_jkAY33mXZYr9mDEK', 'pet-art-0094-e3ku_jkAY33mXZYr9mDEK-2', 'https://ui0arpl8sm.ufs.sh/f/content-H2cOwnX5FCUJzvrQlYvwr.webp'
UNION ALL
SELECT 'pTTUIRbJq87MjhbksMxpp', 'pet-art-0094-pTTUIRbJq87MjhbksMxpp-1', 'https://ui0arpl8sm.ufs.sh/f/content-oEnpWc_WXvpe-ew_4EgmB.webp'
UNION ALL
SELECT 'OS2vEWtn9PpxeoofgOimU', 'pet-art-0094-OS2vEWtn9PpxeoofgOimU-1', 'https://ui0arpl8sm.ufs.sh/f/content-gbwJV86mrgPDoT0xrntFA.webp'
UNION ALL
SELECT '1hG83xIAi3HIv4pH27F1a', 'pet-art-0094-1hG83xIAi3HIv4pH27F1a-1', 'https://ui0arpl8sm.ufs.sh/f/content-WOI6hELNickcllcT2ttjN.webp'
UNION ALL
SELECT 'ft8mDP7ZT6Rgp8tVQgnrr', 'pet-art-0094-ft8mDP7ZT6Rgp8tVQgnrr-1', 'https://ui0arpl8sm.ufs.sh/f/content-NQIOGUnn7fjvePEwfsqXC.webp'
UNION ALL
SELECT 'yp2s41YO1FBf568A5KWgF', 'pet-art-0094-yp2s41YO1FBf568A5KWgF-1', 'https://ui0arpl8sm.ufs.sh/f/content-m8Zclh2myROF1328ZnbmS.webp'
UNION ALL
SELECT 'yp2s41YO1FBf568A5KWgF', 'pet-art-0094-yp2s41YO1FBf568A5KWgF-2', 'https://ui0arpl8sm.ufs.sh/f/content-eIFV2ZLZrbuOLEh8gCQe8.webp'
UNION ALL
SELECT '8Bduhu7awv7lBzpG9Mn4R', 'pet-art-0094-8Bduhu7awv7lBzpG9Mn4R-1', 'https://ui0arpl8sm.ufs.sh/f/content-U8ksC8BIQjwy22ToOkvO4.webp'
UNION ALL
SELECT 'GpoQY3U_UA1CbcYguI3Xr', 'pet-art-0094-GpoQY3U_UA1CbcYguI3Xr-1', 'https://ui0arpl8sm.ufs.sh/f/content-R09dk59y-b8zBChr8cXYK.webp'
UNION ALL
SELECT 'eX4GRXwevEDNWPaC4-8ca', 'pet-art-0094-eX4GRXwevEDNWPaC4-8ca-1', 'https://ui0arpl8sm.ufs.sh/f/content-5AvFb3yk1oBZ7FMaE36v2.webp'
UNION ALL
SELECT 'rNG2-5p7CdAyWXwnbjtnL', 'pet-art-0094-rNG2-5p7CdAyWXwnbjtnL-1', 'https://ui0arpl8sm.ufs.sh/f/content-zTESbFjC47ycQcBEBZjUy.webp'
UNION ALL
SELECT '73ddWW8pqo0dHbGkTlxpN', 'pet-art-0094-73ddWW8pqo0dHbGkTlxpN-1', 'https://ui0arpl8sm.ufs.sh/f/content-SVOFumTa6zvHMbOntgGTy.webp'
UNION ALL
SELECT 'iRNSQAH1_-je-wAJgXIzG', 'pet-art-0094-iRNSQAH1_-je-wAJgXIzG-1', 'https://ui0arpl8sm.ufs.sh/f/content-8182SF2dgQx_ReY7DtEgM.webp'
UNION ALL
SELECT 'gXGYnVZ_kEKS-_HarrcIo', 'pet-art-0094-gXGYnVZ_kEKS-_HarrcIo-1', 'https://ui0arpl8sm.ufs.sh/f/content-SQ_Mf4tITcT2nFG6BdTWh.webp'
UNION ALL
SELECT '0CD3Pg4-rkmaxq9jwuKQY', 'pet-art-0094-0CD3Pg4-rkmaxq9jwuKQY-1', 'https://ui0arpl8sm.ufs.sh/f/content-9Ab7DdC9PMDEFBlL3ho6H.webp'
UNION ALL
SELECT '0CD3Pg4-rkmaxq9jwuKQY', 'pet-art-0094-0CD3Pg4-rkmaxq9jwuKQY-2', 'https://ui0arpl8sm.ufs.sh/f/content-hUoHBRyypVzyggKTrINBD.webp'
UNION ALL
SELECT 'MH9oCeZ-_W8PPC2WUkzKx', 'pet-art-0094-MH9oCeZ-_W8PPC2WUkzKx-1', 'https://ui0arpl8sm.ufs.sh/f/content-xoGhFf71k0GHa4alrXtmb.webp'
UNION ALL
SELECT 'MH9oCeZ-_W8PPC2WUkzKx', 'pet-art-0094-MH9oCeZ-_W8PPC2WUkzKx-2', 'https://ui0arpl8sm.ufs.sh/f/content-1CYcXcRMfyWhzrH5evj91.webp'
UNION ALL
SELECT 'MH9oCeZ-_W8PPC2WUkzKx', 'pet-art-0094-MH9oCeZ-_W8PPC2WUkzKx-3', 'https://ui0arpl8sm.ufs.sh/f/content-Gh0iZeArBFTqb0_J68JjV.webp'
UNION ALL
SELECT 'MH9oCeZ-_W8PPC2WUkzKx', 'pet-art-0094-MH9oCeZ-_W8PPC2WUkzKx-4', 'https://ui0arpl8sm.ufs.sh/f/content-yPHwB50Lu1REDnHlQKK06.webp'
) AS asset
JOIN `UserPet` AS p ON p.`id` = asset.`petId`
JOIN `UserData` AS owner ON owner.`userId` = p.`userId`
LEFT JOIN `UserUpload` AS existing ON existing.`id` = asset.`uploadId`
WHERE existing.`id` IS NULL;

-- Replacement sprites use left-facing source art for display and combat mirroring.
-- Refresh only unchanged artwork identities; never replace newer art or a live generation.
-- Keep intervening feeding, training, names, settings, jobs and owner XP intact.
-- Increment the current revision so application mutations holding an older row retry safely.
UPDATE `UserPet` AS p
JOIN (
SELECT 'AqsIKC1oMOh9-2xaeS3un' AS `petId`, 'pet-species-38' AS `speciesId`, 6 AS `paletteIndex`, 4 AS `characteristicIndex`, 7 AS `auraIndex`, 1 AS `oldRank`, 1 AS `oldArtRank`, 'READY' AS `oldStatus`, 'https://ui0arpl8sm.ufs.sh/f/pet-MZNrdOlmJovVYCkm6uybv.webp' AS `oldAvatar`, 'https://ui0arpl8sm.ufs.sh/f/content-HwQhCqffkPRnJI-pJ6587.webp' AS `newAvatar`, 'left' AS `avatarFacing`
UNION ALL
SELECT 'Ivd0F8vG2tsfeBOAH_93B', 'pet-species-59', 1, 0, 7, 1, 1, 'READY', 'https://ui0arpl8sm.ufs.sh/f/pet-XmcItpG5SZnNDt_KkdUeB.webp', 'https://ui0arpl8sm.ufs.sh/f/content-PxreIpb8jO2lOXhGfQ4Vg.webp', 'left'
UNION ALL
SELECT '-aNSAAxO74C1dN7rGX0vv', 'pet-species-41', 29, 12, 5, 2, 2, 'READY', 'https://ui0arpl8sm.ufs.sh/f/content-eDQc0JCzwM0faJ0MzurWY.webp', 'https://ui0arpl8sm.ufs.sh/f/content-Ogud4KfB3X6uExCsPZHhQ.webp', 'left'
UNION ALL
SELECT 'SCb3Q_ltFIBJVdU9pr56Y', 'pet-species-30', 20, 1, 2, 1, 1, 'READY', 'https://ui0arpl8sm.ufs.sh/f/pet-m9xZWgSUEEVeAE8hLjQQK.webp', 'https://ui0arpl8sm.ufs.sh/f/content-osqgArK0TaRVIfSjHdVlh.webp', 'left'
UNION ALL
SELECT '5YbKe-vjTXn8CqdoJ1wHg', 'pet-species-53', 7, 2, 2, 1, 1, 'READY', 'https://ui0arpl8sm.ufs.sh/f/pet-0jXvVx04FLMI9lLFKJ-fn.webp', 'https://ui0arpl8sm.ufs.sh/f/content-yg1Z2pNv62NG4k5zA25ZC.webp', 'left'
UNION ALL
SELECT 'vobciAWGlIiQ0RQ843kum', 'pet-species-2', 29, 1, 1, 6, 6, 'READY', 'https://ui0arpl8sm.ufs.sh/f/content-97b6HCWPBkLM7AhQ2S3u7.webp', 'https://ui0arpl8sm.ufs.sh/f/content-CZAT1Wul3N6PD-jaKpLAI.webp', 'left'
UNION ALL
SELECT 'baJynPfcWPLAJqeN9CPWa', 'pet-species-42', 9, 6, 5, 1, 1, 'READY', 'https://ui0arpl8sm.ufs.sh/f/pet-0q4PdN2SQoVeyb0iELDhh.webp', 'https://ui0arpl8sm.ufs.sh/f/content-IS-TYLDablB3HRyPTIXh9.webp', 'left'
UNION ALL
SELECT '3Rj_VFVgvPLbIdZwTZ37i', 'pet-species-39', 0, 1, 7, 1, 1, 'READY', 'https://ui0arpl8sm.ufs.sh/f/pet-w0chQBd6OSpyPzTmbXK8E.webp', 'https://ui0arpl8sm.ufs.sh/f/content-ENT9Nt_ZCCG8hy5C1iy7L.webp', 'left'
UNION ALL
SELECT 'PeiCYP2jmIqAFCuqqVBa6', 'pet-species-66', 7, 11, 2, 1, 1, 'READY', 'https://ui0arpl8sm.ufs.sh/f/pet-78GjddA2FzghGNY8Dn9Pu.webp', 'https://ui0arpl8sm.ufs.sh/f/content-Dq-TA2qjSqKG1vIXfZud-.webp', 'left'
UNION ALL
SELECT 'MVIRJlnstuUn57Fl6b3Ts', 'pet-species-4', 25, 6, 7, 1, 0, 'FAILED', NULL, 'https://ui0arpl8sm.ufs.sh/f/content--Zlrhzl7U3KfYHxJ4S1En.webp', 'left'
UNION ALL
SELECT '2IdSFu_QVby2n7jduGyi0', 'pet-species-39', 14, 1, 4, 1, 1, 'READY', 'https://ui0arpl8sm.ufs.sh/f/pet-s87zd38LX1ChvUMnMxFRC.webp', 'https://ui0arpl8sm.ufs.sh/f/content-gUCtbma2tV9wNHm_8mHR9.webp', 'left'
UNION ALL
SELECT 'ikwZ6gsGLRMEDBaifsZID', 'pet-species-15', 5, 11, 6, 1, 0, 'FAILED', NULL, 'https://ui0arpl8sm.ufs.sh/f/content-Esca1nU3Mo1rd3P3-kZf8.webp', 'left'
UNION ALL
SELECT 'WFOtZOlQT4t7b_SJ2szxD', 'm1-McTWnd1beUT3dDwiOw', 2, 7, 7, 1, 1, 'READY', 'https://ui0arpl8sm.ufs.sh/f/pet-9dIv5-rlFtX2JbeXVKei8.webp', 'https://ui0arpl8sm.ufs.sh/f/content-KRAf_YTL2aVz6-2yyCjOG.webp', 'left'
UNION ALL
SELECT 'rhPU3ryVelwum0lBBruVu', 'pet-species-5', 0, 5, 2, 4, 4, 'READY', 'https://ui0arpl8sm.ufs.sh/f/content-pd-EzR_Io5rxUvptus1yZ.webp', 'https://ui0arpl8sm.ufs.sh/f/content-C4aawo4IWf0vDi50s5ZTs.webp', 'left'
UNION ALL
SELECT 'zeZjO2-DegzGpAiFgszy-', 'pet-species-12', 20, 12, 5, 1, 1, 'READY', 'https://ui0arpl8sm.ufs.sh/f/pet-z19gIg-b79zUIzBVZaOji.webp', 'https://ui0arpl8sm.ufs.sh/f/content-2bKGuppbDh1iLLc0Vn3hO.webp', 'left'
UNION ALL
SELECT '-hxRymsvVCRNZsBL48BpC', 'pet-species-0', 29, 12, 5, 2, 2, 'READY', 'https://ui0arpl8sm.ufs.sh/f/content-Lj_g84Kn2S-3rmifbF7eZ.webp', 'https://ui0arpl8sm.ufs.sh/f/content-TSRYTMkfnOoLYq1mvPrrJ.webp', 'left'
UNION ALL
SELECT 'amCit2-YlBbDvo0JuRDpP', 'pet-species-53', 12, 5, 4, 1, 1, 'READY', 'https://ui0arpl8sm.ufs.sh/f/pet-U2JfxNlZryVROKU1oNVHX.webp', 'https://ui0arpl8sm.ufs.sh/f/content-1-js_4-VkcrBMvQCoz13q.webp', 'left'
UNION ALL
SELECT 'JdTnXgURYCcqwMjGLOOq-', 'pet-species-42', 22, 2, 5, 3, 3, 'READY', 'https://ui0arpl8sm.ufs.sh/f/content-FW0OzWDQ43O5uXkMk4OUP.webp', 'https://ui0arpl8sm.ufs.sh/f/content-7V9mySGuX3B2KJkw0vZYB.webp', 'left'
UNION ALL
SELECT 'Gd-esR0BFbCB9lhA-342r', 'pet-species-39', 8, 7, 5, 1, 1, 'READY', 'https://ui0arpl8sm.ufs.sh/f/pet-MHE_NrYTb9qk_dfbAe46g.webp', 'https://ui0arpl8sm.ufs.sh/f/content-AMnXALgC4YOI2KBKqYm1D.webp', 'left'
UNION ALL
SELECT 'LCvxge76Ii8CStZJRBBGl', 'pet-species-53', 25, 4, 2, 1, 0, 'FAILED', NULL, 'https://ui0arpl8sm.ufs.sh/f/content-YGSQFPkEyHmj3D8O2DXLt.webp', 'left'
UNION ALL
SELECT 'v2LTHzHPCPAC6U6zQL2Yy', 'pet-species-46', 2, 4, 1, 3, 3, 'READY', 'https://ui0arpl8sm.ufs.sh/f/content-r5V3i_ZCMs6T1T1D7gapm.webp', 'https://ui0arpl8sm.ufs.sh/f/content-5eBn8PCvejllflQHfluP4.webp', 'left'
UNION ALL
SELECT 'yG8kb9--FuRQw9_fY3sn-', 'pet-species-1', 7, 4, 3, 1, 0, 'FAILED', NULL, 'https://ui0arpl8sm.ufs.sh/f/content-upFANaW_zgM9Ol5dFjdC1.webp', 'left'
UNION ALL
SELECT 'e3ku_jkAY33mXZYr9mDEK', 'pet-species-42', 22, 2, 0, 1, 1, 'READY', 'https://ui0arpl8sm.ufs.sh/f/pet-ILGcoVihnxmHZl_Or8ZL5.webp', 'https://ui0arpl8sm.ufs.sh/f/content-H2cOwnX5FCUJzvrQlYvwr.webp', 'left'
UNION ALL
SELECT 'pTTUIRbJq87MjhbksMxpp', 'pet-species-12', 1, 7, 0, 1, 1, 'READY', 'https://ui0arpl8sm.ufs.sh/f/pet-e-LL2PhlG5KrRgScyVVez.webp', 'https://ui0arpl8sm.ufs.sh/f/content-oEnpWc_WXvpe-ew_4EgmB.webp', 'left'
UNION ALL
SELECT 'OS2vEWtn9PpxeoofgOimU', 'pet-species-64', 30, 9, 1, 2, 2, 'READY', 'https://ui0arpl8sm.ufs.sh/f/content-nlKNZLxRVDr5Eh-0-95iE.webp', 'https://ui0arpl8sm.ufs.sh/f/content-gbwJV86mrgPDoT0xrntFA.webp', 'left'
UNION ALL
SELECT '1hG83xIAi3HIv4pH27F1a', 'pet-species-42', 23, 4, 4, 1, 0, 'FAILED', NULL, 'https://ui0arpl8sm.ufs.sh/f/content-WOI6hELNickcllcT2ttjN.webp', 'left'
UNION ALL
SELECT 'ft8mDP7ZT6Rgp8tVQgnrr', 'pet-species-39', 10, 2, 0, 1, 1, 'READY', 'https://ui0arpl8sm.ufs.sh/f/pet-nzauZiuQnwrAAaIIqOAhh.webp', 'https://ui0arpl8sm.ufs.sh/f/content-NQIOGUnn7fjvePEwfsqXC.webp', 'left'
UNION ALL
SELECT 'yp2s41YO1FBf568A5KWgF', 'pet-species-12', 2, 11, 5, 1, 1, 'READY', 'https://ui0arpl8sm.ufs.sh/f/pet-Z1cp6NfJiQsAE0fcUKexM.webp', 'https://ui0arpl8sm.ufs.sh/f/content-eIFV2ZLZrbuOLEh8gCQe8.webp', 'left'
UNION ALL
SELECT '8Bduhu7awv7lBzpG9Mn4R', 'pet-species-42', 29, 1, 4, 1, 1, 'READY', 'https://ui0arpl8sm.ufs.sh/f/pet-PR_Stbj6GR6f7WIWW9wpB.webp', 'https://ui0arpl8sm.ufs.sh/f/content-U8ksC8BIQjwy22ToOkvO4.webp', 'left'
UNION ALL
SELECT 'GpoQY3U_UA1CbcYguI3Xr', 'pet-species-15', 14, 0, 5, 1, 1, 'READY', 'https://ui0arpl8sm.ufs.sh/f/pet-jm83PigS0_4-ZM54j8_-_.webp', 'https://ui0arpl8sm.ufs.sh/f/content-R09dk59y-b8zBChr8cXYK.webp', 'left'
UNION ALL
SELECT 'eX4GRXwevEDNWPaC4-8ca', 'pet-species-33', 8, 11, 5, 1, 1, 'READY', 'https://ui0arpl8sm.ufs.sh/f/pet-tO1fo-1jF9YYeShtsro_k.webp', 'https://ui0arpl8sm.ufs.sh/f/content-5AvFb3yk1oBZ7FMaE36v2.webp', 'left'
UNION ALL
SELECT 'rNG2-5p7CdAyWXwnbjtnL', 'pet-species-9', 14, 0, 4, 2, 2, 'READY', 'https://ui0arpl8sm.ufs.sh/f/content-seTKaf8raJZdpqb2UeCSJ.webp', 'https://ui0arpl8sm.ufs.sh/f/content-zTESbFjC47ycQcBEBZjUy.webp', 'left'
UNION ALL
SELECT '73ddWW8pqo0dHbGkTlxpN', 'pet-species-0', 14, 1, 3, 1, 0, 'FAILED', NULL, 'https://ui0arpl8sm.ufs.sh/f/content-SVOFumTa6zvHMbOntgGTy.webp', 'left'
UNION ALL
SELECT 'iRNSQAH1_-je-wAJgXIzG', 'pet-species-66', 3, 1, 5, 1, 1, 'READY', 'https://ui0arpl8sm.ufs.sh/f/pet-nLTzZiPqQlX9RKptnzlaY.webp', 'https://ui0arpl8sm.ufs.sh/f/content-8182SF2dgQx_ReY7DtEgM.webp', 'left'
UNION ALL
SELECT 'gXGYnVZ_kEKS-_HarrcIo', 'pet-species-33', 3, 12, 5, 1, 1, 'READY', 'https://ui0arpl8sm.ufs.sh/f/pet-estJpIPbnI7WgUqcTTxxO.webp', 'https://ui0arpl8sm.ufs.sh/f/content-SQ_Mf4tITcT2nFG6BdTWh.webp', 'left'
UNION ALL
SELECT '0CD3Pg4-rkmaxq9jwuKQY', 'pet-species-65', 3, 0, 2, 1, 1, 'READY', 'https://ui0arpl8sm.ufs.sh/f/pet-IG6vQrG61CxyQy9UrlKfB.webp', 'https://ui0arpl8sm.ufs.sh/f/content-hUoHBRyypVzyggKTrINBD.webp', 'left'
UNION ALL
SELECT 'MH9oCeZ-_W8PPC2WUkzKx', 'pet-species-65', 8, 0, 7, 1, 1, 'READY', 'https://ui0arpl8sm.ufs.sh/f/pet-CFciKJapI1bQM07pWdrt8.webp', 'https://ui0arpl8sm.ufs.sh/f/content-yPHwB50Lu1REDnHlQKK06.webp', 'left'
) AS art ON p.`id` = art.`petId`
SET p.`avatar` = art.`newAvatar`,
    p.`avatarFacing` = art.`avatarFacing`,
    p.`generationStatus` = 'READY',
    p.`artRank` = p.`rank`,
    p.`revision` = p.`revision` + 1,
    p.`updatedAt` = CURRENT_TIMESTAMP(3)
WHERE p.`speciesId` = art.`speciesId`
  AND p.`paletteIndex` = art.`paletteIndex`
  AND p.`characteristicIndex` = art.`characteristicIndex`
  AND p.`auraIndex` = art.`auraIndex`
  AND p.`rank` = art.`oldRank`
  AND p.`artRank` = art.`oldArtRank`
  AND p.`generationStatus` = art.`oldStatus`
  AND p.`generationToken` IS NULL
  AND p.`avatar` <=> art.`oldAvatar`;

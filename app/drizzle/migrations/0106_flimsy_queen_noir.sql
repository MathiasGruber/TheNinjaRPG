-- Custom SQL migration file, put you code below! --
INSERT INTO `VillageStructure` 
    (id, name, route, image, villageId, longitude, latitude, hasPage, allyAccess) 
VALUES 
    (
        'YMV7Kbo1OduGfNDYfq5Iv', 
        'Science Building',
        '/science', 
        'https://utfs.io/f/2054268f-482f-4d20-ac62-b04e5ebe6dac-129rrd.webp',
        '1nSqxViGqnXp_xXAPeQMC', 
        4, 4, 1, 1
    );

INSERT INTO `ForumBoard` (id, name, summary, `group`) VALUES ('YMV7Kbo1OduGfNDYfq5', 'History', 'Preserving the history of Seichi', 'Main Broadcast:General boards for TNR'); 
INSERT INTO `ForumBoard` (id, name, summary, `group`) VALUES ('YMV7Kbo1OduGfNDYfq4', 'ANBU HQ', 'Global security information', 'Main Broadcast:General boards for TNR'); 

INSERT INTO `VillageStructure` 
    (id, name, route, image, villageId, longitude, latitude, hasPage, allyAccess) 
VALUES 
    (
        'YMV7Kbo1OduGfNDYfq5I1', 
        'History Building',
        '/historybuilding', 
        'https://utfs.io/f/927dd6f9-cf1a-4569-91c7-b91c7d5532fa-fbtyiv.webp',
        '1nSqxViGqnXp_xXAPeQMC', 
        1, 11, 1, 1
    ),
    (
        'YMV7Kbo1OduGfNDYfq5I2', 
        'Global ANBU HQ',
        '/globalanbuhq', 
        'https://utfs.io/f/e3b2ad70-bfd2-439d-8fb5-4ab58cebd1ad-vrmux1.webp',
        '1nSqxViGqnXp_xXAPeQMC', 
        4, 7, 1, 1
    );


INSERT INTO `VillageStructure` 
    (id, name, route, image, villageId, longitude, latitude, hasPage, allyAccess) 
VALUES 
    (
        'YMV7Kbo1OduGfNDYfq5I3', 
        'Souvenir Shop',
        '/souvenirs', 
        'https://utfs.io/f/69c3c4d9-04ee-453c-a332-5f5795601b47-b4dgyz.webp',
        '1nSqxViGqnXp_xXAPeQMC', 
        1, 3, 1, 1
    )

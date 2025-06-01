SELECT ud.username, ud.rank, upv.*
FROM UserPollVote upv
INNER JOIN UserData ud ON upv.userId = ud.userId
WHERE ud.rank = 'STUDENT';
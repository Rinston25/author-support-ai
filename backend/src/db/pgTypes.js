import pg from 'pg'

// Return DATE columns as plain 'YYYY-MM-DD' strings. The default converts them to
// JS Dates in the server's timezone, which can shift the day. Import this once
// wherever a pg pool is created (the app, scripts and tests).
pg.types.setTypeParser(1082, (value) => value)
